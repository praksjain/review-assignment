import os
import json
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_connection
from auth import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_token,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from middleware import get_current_user

log = logging.getLogger("api.auth_routes")

router = APIRouter(prefix="/auth", tags=["auth"])

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "pos-events")

_kafka_producer = None


def _get_kafka_producer():
    global _kafka_producer
    if _kafka_producer is None:
        try:
            from confluent_kafka import Producer
            _kafka_producer = Producer({
                "bootstrap.servers": KAFKA_BROKER,
                "client.id": "api-auth-producer",
            })
        except Exception:
            log.warning("Kafka producer unavailable — login events will not be published")
    return _kafka_producer


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login")
def login(body: LoginRequest):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, username, password_hash, display_name FROM employees WHERE username = %s",
                (body.username,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=401, detail="Invalid credentials")

            emp_id, username, pw_hash, display_name = row

            if not verify_password(body.password, pw_hash):
                raise HTTPException(status_code=401, detail="Invalid credentials")

            cur.execute(
                "SELECT r.name FROM roles r "
                "JOIN employee_roles er ON er.role_id = r.id "
                "WHERE er.employee_id = %s",
                (emp_id,),
            )
            roles = [r[0] for r in cur.fetchall()]

            access_token = create_access_token(emp_id, username, roles)
            refresh_token, token_hash = create_refresh_token(emp_id)

            expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
            cur.execute(
                "INSERT INTO refresh_tokens (employee_id, token_hash, expires_at) VALUES (%s, %s, %s)",
                (emp_id, token_hash, expires_at),
            )
            conn.commit()

        _publish_login_event(emp_id, username, roles)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "employee_id": emp_id,
            "username": username,
            "display_name": display_name,
            "roles": roles,
        }
    finally:
        conn.close()


@router.post("/refresh")
def refresh(body: RefreshRequest):
    try:
        payload = decode_refresh_token(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    emp_id = int(payload["sub"])
    token_hash = hash_token(body.refresh_token)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, revoked, expires_at FROM refresh_tokens "
                "WHERE token_hash = %s AND employee_id = %s",
                (token_hash, emp_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=401, detail="Refresh token not found")

            rt_id, revoked, expires_at = row
            if revoked:
                raise HTTPException(status_code=401, detail="Refresh token revoked")
            if expires_at < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Refresh token expired")

            cur.execute("UPDATE refresh_tokens SET revoked = true WHERE id = %s", (rt_id,))

            cur.execute(
                "SELECT r.name FROM roles r "
                "JOIN employee_roles er ON er.role_id = r.id "
                "WHERE er.employee_id = %s",
                (emp_id,),
            )
            roles = [r[0] for r in cur.fetchall()]

            cur.execute("SELECT username FROM employees WHERE id = %s", (emp_id,))
            username = cur.fetchone()[0]

            access_token = create_access_token(emp_id, username, roles)
            new_refresh, new_hash = create_refresh_token(emp_id)
            new_expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
            cur.execute(
                "INSERT INTO refresh_tokens (employee_id, token_hash, expires_at) VALUES (%s, %s, %s)",
                (emp_id, new_hash, new_expires),
            )

            conn.commit()

        return {
            "access_token": access_token,
            "refresh_token": new_refresh,
            "token_type": "bearer",
        }
    finally:
        conn.close()


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return {
        "employee_id": user["employee_id"],
        "username": user["username"],
        "roles": user["roles"],
    }


def _publish_login_event(emp_id: int, username: str, roles: list[str]):
    producer = _get_kafka_producer()
    if producer is None:
        return
    try:
        event = {
            "event_type": "employee.login",
            "employee_id": f"EMP-{emp_id:04d}",
            "username": username,
            "roles": roles,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "store_id": "API-LOGIN",
            "terminal_id": "WEB",
        }
        producer.produce(
            topic=KAFKA_TOPIC,
            key=str(emp_id),
            value=json.dumps(event),
        )
        producer.flush(timeout=5)
        log.info("Published EMPLOYEE_LOGGED_IN event for %s", username)
    except Exception:
        log.exception("Failed to publish login event")


def _publish_logout_event(emp_id: int, username: str, roles: list[str]):
    producer = _get_kafka_producer()
    if producer is None:
        return
    try:
        event = {
            "event_type": "employee.logout",
            "employee_id": f"EMP-{emp_id:04d}",
            "username": username,
            "roles": roles,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "store_id": "API-LOGOUT",
            "terminal_id": "WEB",
        }
        producer.produce(
            topic=KAFKA_TOPIC,
            key=str(emp_id),
            value=json.dumps(event),
        )
        producer.flush(timeout=5)
        log.info("Published EMPLOYEE_LOGGED_OUT event for %s", username)
    except Exception:
        log.exception("Failed to publish logout event")


@router.post("/logout")
def logout(user: dict = Depends(get_current_user)):
    """Record an employee.logout event when a user signs out of the dashboard."""
    _publish_logout_event(user["employee_id"], user["username"], user["roles"])
    return {"status": "ok"}

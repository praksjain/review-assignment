import os
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
import bcrypt

JWT_SECRET = os.getenv("JWT_SECRET", "ChangeSecret")
JWT_REFRESH_SECRET = os.getenv("JWT_REFRESH_SECRET", "ChangeSecret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(employee_id: int, username: str, roles: list[str]) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(employee_id),
        "username": username,
        "roles": roles,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(employee_id: int) -> tuple[str, str]:
    """Returns (raw_token, token_hash) — store the hash, return the raw token to the client."""
    raw = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(employee_id),
        "type": "refresh",
        "jti": raw,
        "iat": now,
        "exp": now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    token = jwt.encode(payload, JWT_REFRESH_SECRET, algorithm=JWT_ALGORITHM)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    return token, token_hash


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Not an access token")
    return payload


def decode_refresh_token(token: str) -> dict:
    payload = jwt.decode(token, JWT_REFRESH_SECRET, algorithms=[JWT_ALGORITHM])
    if payload.get("type") != "refresh":
        raise jwt.InvalidTokenError("Not a refresh token")
    return payload


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

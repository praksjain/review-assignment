import os
import psycopg2
import psycopg2.extras


def get_connection():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "postgres"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
    )


def fetch_all_plugins(consumer: str = None) -> list[dict]:
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if consumer:
                cur.execute(
                    "SELECT id, name, is_active, settings, consumer, description, created_at, updated_at "
                    "FROM plugins WHERE consumer = %s ORDER BY id",
                    (consumer,),
                )
            else:
                cur.execute(
                    "SELECT id, name, is_active, settings, consumer, description, created_at, updated_at "
                    "FROM plugins ORDER BY id"
                )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_plugin_by_id(plugin_id: int) -> dict | None:
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, name, is_active, settings, consumer, description, created_at, updated_at "
                "FROM plugins WHERE id = %s",
                (plugin_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def update_plugin(plugin_id: int, is_active: bool = None, settings: dict = None) -> dict | None:
    conn = get_connection()
    try:
        parts = []
        params = []
        if is_active is not None:
            parts.append("is_active = %s")
            params.append(is_active)
        if settings is not None:
            parts.append("settings = %s")
            params.append(psycopg2.extras.Json(settings))
        if not parts:
            return fetch_plugin_by_id(plugin_id)

        parts.append("updated_at = NOW()")
        params.append(plugin_id)
        query = f"UPDATE plugins SET {', '.join(parts)} WHERE id = %s RETURNING id, name, is_active, settings, consumer, description, created_at, updated_at"

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    finally:
        conn.close()


def fetch_event_log(limit: int = 50) -> list[dict]:
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, event_type, transaction_id, payload, plugin_name, consumer, processed_at "
                "FROM event_log ORDER BY id DESC LIMIT %s",
                (limit,),
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def delete_all_events() -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM event_log")
            count = cur.rowcount
        conn.commit()
        return count
    finally:
        conn.close()

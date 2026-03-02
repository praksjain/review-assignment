import os
import time
import threading
import logging

import psycopg2
import psycopg2.extras

log = logging.getLogger("config_store")


class ConfigStore:
    """
    Periodically polls the plugins table in PostgreSQL and caches the result
    in memory. Consumers read from the cache so they never block on DB calls
    during event processing.
    """

    def __init__(self, consumer_name: str, refresh_interval: int = None):
        self._consumer_name = consumer_name
        self._refresh_interval = refresh_interval or int(os.getenv("CONFIG_REFRESH_INTERVAL", "5"))
        self._cache: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._running = False
        self._thread = None
        self._dsn = self._build_dsn()

    @staticmethod
    def _build_dsn() -> str:
        return (
            f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
            f"port={os.getenv('POSTGRES_PORT', '5432')} "
            f"dbname={os.getenv('POSTGRES_DB', 'postgress')} "
            f"user={os.getenv('POSTGRES_USER', 'postgres')} "
            f"password={os.getenv('POSTGRES_PASSWORD', 'postgres')}"
        )

    def _fetch_plugins(self):
        try:
            conn = psycopg2.connect(self._dsn)
            conn.autocommit = True
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT id, name, is_active, settings FROM plugins WHERE consumer = %s",
                    (self._consumer_name,),
                )
                rows = cur.fetchall()
            conn.close()

            new_cache = {}
            for row in rows:
                new_cache[row["name"]] = {
                    "id": row["id"],
                    "is_active": row["is_active"],
                    "settings": row["settings"] or {},
                }
            with self._lock:
                self._cache = new_cache
            log.debug("Refreshed plugin config: %d plugins loaded", len(new_cache))
        except Exception:
            log.exception("Failed to refresh plugin config from PostgreSQL")

    def _poll_loop(self):
        while self._running:
            self._fetch_plugins()
            time.sleep(self._refresh_interval)

    def start(self):
        self._running = True
        self._fetch_plugins()
        self._thread = threading.Thread(target=self._poll_loop, daemon=True, name="config-poller")
        self._thread.start()
        log.info("Config store polling started (every %ds)", self._refresh_interval)

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=self._refresh_interval + 1)
        log.info("Config store stopped")

    def get_plugin_config(self, plugin_name: str) -> dict | None:
        with self._lock:
            return self._cache.get(plugin_name)

    def all_configs(self) -> dict[str, dict]:
        with self._lock:
            return dict(self._cache)

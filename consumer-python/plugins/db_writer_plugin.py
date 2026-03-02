import logging

from base_plugin import BasePlugin

log = logging.getLogger("plugin.db_writer")


class DbWriterPlugin(BasePlugin):
    """Persists qualifying events into the event_log table in PostgreSQL.

    Actual DB write is handled by the consumer main loop for ALL plugins.
    This plugin accepts all event types so they get recorded.
    """

    @property
    def name(self) -> str:
        return "db_writer_plugin"

    def handle(self, event: dict, settings: dict = None) -> None:
        log.info("Processed event for DB logging: %s", event.get("event_type"))

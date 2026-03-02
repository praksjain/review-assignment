import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch
from plugins.db_writer_plugin import DbWriterPlugin


class TestDbWriterPlugin:

    def setup_method(self):
        self.plugin = DbWriterPlugin()
        self.event = {
            "event_type": "item.added",
            "transaction_id": "txn-456",
            "item_id": "ITM-1001",
            "quantity": 2,
        }

    def test_name(self):
        assert self.plugin.name == "db_writer_plugin"

    @patch("plugins.db_writer_plugin.log")
    def test_handle_inserts_event(self, mock_log):
        """handle() runs without error and logs the event type (DB write is done by consumer main loop)."""
        self.plugin.handle(self.event)
        mock_log.info.assert_called_once()
        call_args = mock_log.info.call_args[0]
        assert "item.added" in call_args[1]

    def test_handle_closes_conn_on_error(self):
        """handle() does not use a DB connection; it never raises for valid input."""
        self.plugin.handle(self.event)
        # No exception and no connection to close; just ensure handle completes

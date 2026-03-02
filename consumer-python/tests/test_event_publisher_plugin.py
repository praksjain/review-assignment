import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock
import plugins.event_publisher_plugin as ep_module
from plugins.event_publisher_plugin import EventPublisherPlugin


class TestEventPublisherPlugin:

    def setup_method(self):
        self.plugin = EventPublisherPlugin()
        self.event = {
            "event_type": "payment.completed",
            "transaction_id": "txn-789",
            "amount_paid": 100.00,
        }

    def test_name(self):
        assert self.plugin.name == "event_publisher_plugin"

    @patch.object(ep_module, "_get_producer")
    def test_handle_produces_derived_event(self, mock_get_producer):
        mock_producer = MagicMock()
        mock_get_producer.return_value = mock_producer

        settings = {"derived_event_type": "transaction.verified"}
        self.plugin.handle(self.event, settings)

        mock_producer.produce.assert_called_once()
        call_kwargs = mock_producer.produce.call_args
        assert call_kwargs[1]["topic"] == "pos-derived-events"
        assert call_kwargs[1]["key"] == "txn-789"
        mock_producer.flush.assert_called_once()

    @patch.object(ep_module, "_get_producer")
    def test_handle_uses_default_derived_type(self, mock_get_producer):
        mock_producer = MagicMock()
        mock_get_producer.return_value = mock_producer

        self.plugin.handle(self.event)

        call_kwargs = mock_producer.produce.call_args
        import json
        value = json.loads(call_kwargs[1]["value"])
        assert value["event_type"] == "transaction.verified"

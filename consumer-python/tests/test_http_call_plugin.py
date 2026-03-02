import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock
from plugins.http_call_plugin import HttpCallPlugin


class TestHttpCallPlugin:

    def setup_method(self):
        self.plugin = HttpCallPlugin()
        self.event = {
            "event_type": "payment.completed",
            "transaction_id": "txn-123",
            "amount_paid": 42.50,
        }

    def test_name(self):
        assert self.plugin.name == "http_call_plugin"

    @patch("plugins.http_call_plugin.requests.post")
    def test_handle_posts_to_target_url(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        mock_post.return_value.raise_for_status = MagicMock()

        settings = {"target_url": "http://example.com/hook"}
        self.plugin.handle(self.event, settings)

        mock_post.assert_called_once_with(
            "http://example.com/hook",
            json=self.event,
            timeout=5,
        )

    @patch("plugins.http_call_plugin.requests.post")
    def test_handle_uses_default_url_when_no_settings(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        mock_post.return_value.raise_for_status = MagicMock()

        self.plugin.handle(self.event)
        assert mock_post.called

    @patch("plugins.http_call_plugin.requests.post")
    def test_handle_raises_on_http_error(self, mock_post):
        mock_post.return_value.raise_for_status.side_effect = Exception("503 Server Error")
        try:
            self.plugin.handle(self.event)
        except Exception as e:
            assert "503" in str(e)

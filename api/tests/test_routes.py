import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app
from auth import create_access_token

client = TestClient(app)


def _admin_headers():
    token = create_access_token(1, "admin", ["ADMIN", "EMPLOYEE"])
    return {"Authorization": f"Bearer {token}"}


def _employee_headers():
    token = create_access_token(2, "employee1", ["EMPLOYEE"])
    return {"Authorization": f"Bearer {token}"}


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestMockWebhook:
    def test_webhook_accepts_post(self):
        resp = client.post("/webhook/mock", json={"event_type": "test.event"})
        assert resp.status_code == 200
        assert resp.json()["received"] is True


class TestAuthRequired:
    @patch("routes.fetch_all_plugins")
    def test_plugins_requires_auth(self, mock_fetch):
        resp = client.get("/plugins")
        assert resp.status_code == 401

    @patch("routes.fetch_event_log")
    def test_events_requires_auth(self, mock_fetch):
        resp = client.get("/events")
        assert resp.status_code == 401


class TestPluginEndpoints:
    @patch("routes.fetch_all_plugins")
    def test_list_plugins_authenticated(self, mock_fetch):
        mock_fetch.return_value = [
            {"id": 1, "name": "test_plugin", "is_active": True, "settings": {}, "consumer": "python", "description": "Test"}
        ]
        resp = client.get("/plugins", headers=_employee_headers())
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @patch("routes.fetch_plugin_by_id")
    def test_get_plugin_not_found(self, mock_fetch):
        mock_fetch.return_value = None
        resp = client.get("/plugins/999", headers=_admin_headers())
        assert resp.status_code == 404

    @patch("routes.update_plugin")
    @patch("routes.fetch_plugin_by_id")
    def test_update_plugin_admin_allowed(self, mock_fetch, mock_update):
        mock_fetch.return_value = {"id": 1, "name": "test_plugin", "is_active": True, "settings": {}, "consumer": "python", "description": None}
        mock_update.return_value = {"id": 1, "name": "test_plugin", "is_active": False, "settings": {}, "consumer": "python", "description": None, "created_at": "2024-01-01", "updated_at": "2024-01-01"}
        resp = client.put("/plugins/1", json={"is_active": False}, headers=_admin_headers())
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

    @patch("routes.fetch_plugin_by_id")
    def test_update_plugin_employee_forbidden(self, mock_fetch):
        resp = client.put("/plugins/1", json={"is_active": False}, headers=_employee_headers())
        assert resp.status_code == 403


class TestEventEndpoints:
    @patch("routes.fetch_event_log")
    def test_list_events_authenticated(self, mock_fetch):
        mock_fetch.return_value = []
        resp = client.get("/events", headers=_employee_headers())
        assert resp.status_code == 200

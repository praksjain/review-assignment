import os
import logging

import requests

from base_plugin import BasePlugin

log = logging.getLogger("plugin.http_call")

DEFAULT_URL = os.getenv("HTTP_PLUGIN_URL", "http://api:8000/webhook/mock")
TIMEOUT_SECONDS = 5


class HttpCallPlugin(BasePlugin):
    """Posts qualifying event payloads to a configurable HTTP endpoint."""

    @property
    def name(self) -> str:
        return "http_call_plugin"

    def handle(self, event: dict, settings: dict = None) -> None:
        target_url = (settings or {}).get("target_url", DEFAULT_URL)
        log.info("POST %s  event_type=%s", target_url, event.get("event_type"))
        resp = requests.post(target_url, json=event, timeout=TIMEOUT_SECONDS)
        resp.raise_for_status()
        log.info("HTTP %d from %s", resp.status_code, target_url)

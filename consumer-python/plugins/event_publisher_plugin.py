import os
import json
import logging
from datetime import datetime, timezone

from confluent_kafka import Producer

from base_plugin import BasePlugin

log = logging.getLogger("plugin.event_publisher")

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
DERIVED_TOPIC = os.getenv("KAFKA_DERIVED_TOPIC", "pos-derived-events")

_producer = None


def _get_producer() -> Producer:
    global _producer
    if _producer is None:
        _producer = Producer({
            "bootstrap.servers": KAFKA_BROKER,
            "client.id": "python-event-publisher-plugin",
        })
    return _producer


class EventPublisherPlugin(BasePlugin):
    """Publishes a derived event back to Kafka when a qualifying event arrives."""

    @property
    def name(self) -> str:
        return "event_publisher_plugin"

    def handle(self, event: dict, settings: dict = None) -> None:
        derived_type = (settings or {}).get("derived_event_type", "transaction.verified")
        derived_event = {
            "event_type": derived_type,
            "source_event_type": event.get("event_type"),
            "transaction_id": event.get("transaction_id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "original_payload": event,
        }

        key = event.get("transaction_id", "unknown")
        producer = _get_producer()
        producer.produce(
            topic=DERIVED_TOPIC,
            key=str(key),
            value=json.dumps(derived_event),
        )
        producer.flush(timeout=5)
        log.info("Published derived event %s for txn %s", derived_type, key)

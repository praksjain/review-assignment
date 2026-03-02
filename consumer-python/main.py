import os
import sys
import json
import time
import signal
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

import psycopg2
from confluent_kafka import Consumer, Producer, KafkaError

from plugin_loader import discover_plugins
from config_store import ConfigStore

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
log = logging.getLogger("consumer-python")

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "pos-events")
DLQ_TOPIC = os.getenv("KAFKA_DLQ_TOPIC", "pos-events-dlq")
CONSUMER_GROUP = "pos-consumer-python"
MAX_RETRIES = 3
HEALTH_PORT = 8081

CONSUMER_NAME = "python"

running = True
healthy = True


def _get_db_connection():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "postgres"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
    )


def log_plugin_execution(event: dict, plugin_name: str):
    try:
        conn = _get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO event_log (event_type, transaction_id, payload, plugin_name, consumer) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (
                        event.get("event_type"),
                        event.get("transaction_id"),
                        json.dumps(event),
                        plugin_name,
                        CONSUMER_NAME,
                    ),
                )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        log.error("Failed to log plugin execution for %s: %s", plugin_name, exc)


# --- Health endpoint ----------------------------------------------------------

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200 if healthy else 503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok" if healthy else "unhealthy"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress request logs


def start_health_server():
    server = HTTPServer(("0.0.0.0", HEALTH_PORT), HealthHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True, name="health-server")
    t.start()
    log.info("Health server listening on :%d", HEALTH_PORT)
    return server


# --- DLQ producer -------------------------------------------------------------

def get_dlq_producer() -> Producer:
    return Producer({"bootstrap.servers": KAFKA_BROKER, "client.id": "python-dlq-producer"})


def send_to_dlq(producer: Producer, event: dict, plugin_name: str, error_msg: str):
    envelope = {
        "original_event": event,
        "plugin_name": plugin_name,
        "error": error_msg,
        "consumer": "python",
    }
    producer.produce(
        topic=DLQ_TOPIC,
        key=str(event.get("transaction_id", "unknown")),
        value=json.dumps(envelope),
    )
    producer.flush(timeout=5)
    log.warning("Sent event to DLQ for plugin=%s  error=%s", plugin_name, error_msg)


# --- Retry wrapper ------------------------------------------------------------

def execute_with_retry(plugin, event, settings, dlq_producer) -> bool:
    """Exponential backoff: 1s → 2s → 4s, then DLQ. Returns True on success."""
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            plugin.handle(event, settings)
            return True
        except Exception as exc:
            last_error = exc
            wait = 2 ** (attempt - 1)
            log.error(
                "Plugin %s failed (attempt %d/%d): %s — retrying in %ds",
                plugin.name, attempt, MAX_RETRIES, exc, wait,
            )
            time.sleep(wait)

    send_to_dlq(dlq_producer, event, plugin.name, str(last_error))
    return False


# --- Main loop ----------------------------------------------------------------

def main():
    global running, healthy

    def shutdown(signum, _frame):
        global running
        log.info("Shutdown signal received (%s), finishing current batch...", signum)
        running = False

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    health_server = start_health_server()

    config_store = ConfigStore(consumer_name="python")
    config_store.start()

    plugins = discover_plugins()
    log.info("Plugins ready: %s", [p.name for p in plugins])

    dlq_producer = get_dlq_producer()

    consumer = Consumer({
        "bootstrap.servers": KAFKA_BROKER,
        "group.id": CONSUMER_GROUP,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": True,
        "session.timeout.ms": 30000,
    })
    consumer.subscribe([KAFKA_TOPIC])
    log.info("Subscribed to topic: %s", KAFKA_TOPIC)

    try:
        while running:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                log.error("Kafka error: %s", msg.error())
                continue

            try:
                event = json.loads(msg.value().decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                log.error("Failed to decode message: %s", exc)
                continue

            event_type = event.get("event_type", "unknown")
            log.info("Received event: %s  txn=%s", event_type, event.get("transaction_id"))

            for plugin in plugins:
                cfg = config_store.get_plugin_config(plugin.name)
                if cfg is None:
                    continue
                if not cfg["is_active"]:
                    continue
                if not plugin.matches(event, cfg["settings"]):
                    continue

                log.info("Dispatching to plugin: %s", plugin.name)
                ok = execute_with_retry(plugin, event, cfg["settings"], dlq_producer)
                if ok:
                    log_plugin_execution(event, plugin.name)

    except Exception:
        log.exception("Fatal error in consumer loop")
        healthy = False
    finally:
        log.info("Closing consumer...")
        consumer.close()
        config_store.stop()
        health_server.shutdown()
        log.info("Consumer shut down cleanly")


if __name__ == "__main__":
    main()

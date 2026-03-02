import os
import sys
import json
import time
import signal
import logging
from confluent_kafka import Producer

from events import generate_transaction_events

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","module":"%(module)s","message":"%(message)s"}',
)
log = logging.getLogger("generator")

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "pos-events")
MODE = os.getenv("GENERATOR_MODE", "burst")
TXN_COUNT = int(os.getenv("GENERATOR_TRANSACTION_COUNT", "8"))

running = True


def _shutdown(signum, frame):
    global running
    log.info("Received shutdown signal, finishing up...")
    running = False


signal.signal(signal.SIGTERM, _shutdown)
signal.signal(signal.SIGINT, _shutdown)


def delivery_report(err, msg):
    if err:
        log.error("Delivery failed for %s: %s", msg.key(), err)
    else:
        log.info(
            "Delivered event to %s [partition %d] @ offset %d",
            msg.topic(), msg.partition(), msg.offset(),
        )


def wait_for_kafka(producer, retries=30, delay=2):
    """Block until Kafka is reachable."""
    for attempt in range(retries):
        try:
            metadata = producer.list_topics(timeout=5)
            if metadata.topics:
                log.info("Kafka is ready (%d topics available)", len(metadata.topics))
                return
        except Exception:
            pass
        log.info("Waiting for Kafka... attempt %d/%d", attempt + 1, retries)
        time.sleep(delay)
    log.error("Kafka not available after %d attempts, exiting", retries)
    sys.exit(1)


def publish_transaction(producer, txn_id, events):
    """Publish all events for a single transaction, keyed by txn_id for ordering."""
    for event in events:
        key = event.get("transaction_id") or event.get("employee_id", txn_id)
        producer.produce(
            topic=KAFKA_TOPIC,
            key=str(key),
            value=json.dumps(event),
            callback=delivery_report,
        )
    producer.flush()


def run_burst(producer):
    """Generate a fixed number of transaction sequences on startup."""
    log.info("Burst mode: generating %d transactions", TXN_COUNT)
    for i in range(TXN_COUNT):
        txn_id, events = generate_transaction_events()
        log.info("Publishing transaction %d/%d  txn_id=%s  events=%d", i + 1, TXN_COUNT, txn_id, len(events))
        publish_transaction(producer, txn_id, events)
    log.info("Burst complete — %d transactions published", TXN_COUNT)


def run_continuous(producer):
    """Continuously generate transactions at a steady interval."""
    log.info("Continuous mode: publishing a new transaction every 5 seconds")
    seq = 0
    while running:
        seq += 1
        txn_id, events = generate_transaction_events()
        log.info("Publishing transaction #%d  txn_id=%s", seq, txn_id)
        publish_transaction(producer, txn_id, events)
        for _ in range(50):
            if not running:
                break
            time.sleep(0.1)


def main():
    producer = Producer({
        "bootstrap.servers": KAFKA_BROKER,
        "client.id": "pos-event-generator",
        "acks": "all",
    })

    wait_for_kafka(producer)

    # Always do an initial burst
    run_burst(producer)

    if MODE == "continuous":
        run_continuous(producer)
    else:
        log.info("Generator finished (burst mode). Exiting.")


if __name__ == "__main__":
    main()

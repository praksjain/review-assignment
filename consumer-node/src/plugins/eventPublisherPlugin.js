const { Kafka } = require("kafkajs");
const BasePlugin = require("../basePlugin");
const pino = require("pino");

const log = pino({ name: "plugin.event_publisher" });

const BROKER = process.env.KAFKA_BROKER || "kafka:9092";
const DERIVED_TOPIC = process.env.KAFKA_DERIVED_TOPIC || "pos-derived-events";

const kafka = new Kafka({ clientId: "node-event-publisher-plugin", brokers: [BROKER] });
const producer = kafka.producer();
let connected = false;

async function ensureConnected() {
  if (!connected) {
    await producer.connect();
    connected = true;
  }
}

class EventPublisherPlugin extends BasePlugin {
  get name() {
    return "event_publisher_plugin_node";
  }

  async handle(event, settings) {
    const derivedType = (settings && settings.derived_event_type) || "transaction.verified";
    const derivedEvent = {
      event_type: derivedType,
      source_event_type: event.event_type,
      transaction_id: event.transaction_id,
      timestamp: new Date().toISOString(),
      original_payload: event,
    };

    await ensureConnected();
    await producer.send({
      topic: DERIVED_TOPIC,
      messages: [
        {
          key: event.transaction_id || "unknown",
          value: JSON.stringify(derivedEvent),
        },
      ],
    });
    log.info({ derived_type: derivedType, txn: event.transaction_id }, "Published derived event");
  }
}

module.exports = EventPublisherPlugin;

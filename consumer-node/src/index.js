const { Kafka } = require("kafkajs");
const { Pool } = require("pg");
const express = require("express");
const pino = require("pino");

const ConfigStore = require("./configStore");
const { discoverPlugins } = require("./pluginLoader");

const log = pino({ name: "consumer-node" });

const BROKER = process.env.KAFKA_BROKER || "kafka:9092";
const TOPIC = process.env.KAFKA_TOPIC || "pos-events";
const DLQ_TOPIC = process.env.KAFKA_DLQ_TOPIC || "pos-events-dlq";
const GROUP_ID = "pos-consumer-node";
const MAX_RETRIES = 3;
const HEALTH_PORT = 8082;
const CONSUMER_NAME = "node";

let healthy = true;

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
  database: process.env.POSTGRES_DB || "postgres",
  user: process.env.POSTGRES_USER || "postgres",
  password: process.env.POSTGRES_PASSWORD || "postgres",
  max: 5,
});

async function logPluginExecution(event, pluginName) {
  try {
    await pgPool.query(
      "INSERT INTO event_log (event_type, transaction_id, payload, plugin_name, consumer) VALUES ($1, $2, $3, $4, $5)",
      [
        event.event_type,
        event.transaction_id || null,
        JSON.stringify(event),
        pluginName,
        CONSUMER_NAME,
      ]
    );
  } catch (err) {
    log.error({ err, plugin: pluginName }, "Failed to log plugin execution");
  }
}

// --- Health server -----------------------------------------------------------

function startHealthServer() {
  const app = express();
  app.get("/health", (_req, res) => {
    res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "unhealthy" });
  });
  const server = app.listen(HEALTH_PORT, () => {
    log.info({ port: HEALTH_PORT }, "Health server listening");
  });
  return server;
}

// --- DLQ producer ------------------------------------------------------------

async function createDlqProducer(kafka) {
  const producer = kafka.producer();
  await producer.connect();
  return producer;
}

async function sendToDlq(producer, event, pluginName, errorMsg) {
  const envelope = {
    original_event: event,
    plugin_name: pluginName,
    error: errorMsg,
    consumer: "node",
  };
  await producer.send({
    topic: DLQ_TOPIC,
    messages: [
      {
        key: event.transaction_id || "unknown",
        value: JSON.stringify(envelope),
      },
    ],
  });
  log.warn({ plugin: pluginName, error: errorMsg }, "Sent event to DLQ");
}

// --- Retry wrapper -----------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeWithRetry(plugin, event, settings, dlqProducer) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await plugin.handle(event, settings);
      return true;
    } catch (err) {
      lastError = err;
      const wait = Math.pow(2, attempt - 1) * 1000;
      log.error(
        { plugin: plugin.name, attempt, maxRetries: MAX_RETRIES, err: err.message, wait },
        "Plugin failed, retrying"
      );
      await sleep(wait);
    }
  }
  await sendToDlq(dlqProducer, event, plugin.name, lastError.message);
  return false;
}

// --- Main --------------------------------------------------------------------

async function main() {
  const healthServer = startHealthServer();
  const configStore = new ConfigStore("node");
  await configStore.start();

  const plugins = discoverPlugins();
  log.info({ plugins: plugins.map((p) => p.name) }, "Plugins ready");

  const kafka = new Kafka({
    clientId: "pos-consumer-node",
    brokers: [BROKER],
    retry: { retries: 5 },
  });

  const consumer = kafka.consumer({ groupId: GROUP_ID });
  const dlqProducer = await createDlqProducer(kafka);

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  log.info({ topic: TOPIC }, "Subscribed");

  await consumer.run({
    eachMessage: async ({ message }) => {
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch (err) {
        log.error({ err }, "Failed to parse message");
        return;
      }

      log.info({ event_type: event.event_type, txn: event.transaction_id }, "Received event");

      for (const plugin of plugins) {
        const cfg = configStore.getPluginConfig(plugin.name);
        if (!cfg) continue;
        if (!cfg.is_active) continue;
        if (!plugin.matches(event, cfg.settings)) continue;

        log.info({ plugin: plugin.name }, "Dispatching to plugin");
        const ok = await executeWithRetry(plugin, event, cfg.settings, dlqProducer);
        if (ok) {
          await logPluginExecution(event, plugin.name);
        }
      }
    },
  });

  // Graceful shutdown
  const shutdown = async () => {
    log.info("Shutdown signal received, disconnecting...");
    healthy = false;
    await consumer.disconnect();
    await dlqProducer.disconnect();
    await configStore.stop();
    healthServer.close();
    log.info("Consumer shut down cleanly");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  log.fatal({ err }, "Fatal error in consumer");
  process.exit(1);
});

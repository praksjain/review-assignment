const BasePlugin = require("../basePlugin");
const pino = require("pino");

const log = pino({ name: "plugin.db_writer" });

class DbWriterPlugin extends BasePlugin {
  /**
   * Persists qualifying events into the event_log table in PostgreSQL.
   * Actual DB write is handled by the consumer main loop for ALL plugins.
   * This plugin accepts all event types so they get recorded.
   */
  get name() {
    return "db_writer_plugin_node";
  }

  async handle(event, _settings) {
    log.info({ event_type: event.event_type }, "Processed event for DB logging");
  }
}

module.exports = DbWriterPlugin;

const { Pool } = require("pg");
const pino = require("pino");

const log = pino({ name: "config-store" });

class ConfigStore {
  constructor(consumerName, refreshInterval) {
    this._consumerName = consumerName;
    this._refreshInterval = (refreshInterval || parseInt(process.env.CONFIG_REFRESH_INTERVAL, 10) || 5) * 1000;
    this._cache = new Map();
    this._timer = null;

    this._pool = new Pool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
      database: process.env.POSTGRES_DB || "postgres",
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD || "postgres",
      max: 3,
    });
  }

  async _fetchPlugins() {
    try {
      const { rows } = await this._pool.query(
        "SELECT id, name, is_active, settings FROM plugins WHERE consumer = $1",
        [this._consumerName]
      );
      const newCache = new Map();
      for (const row of rows) {
        newCache.set(row.name, {
          id: row.id,
          is_active: row.is_active,
          settings: row.settings || {},
        });
      }
      this._cache = newCache;
      log.debug({ count: newCache.size }, "Refreshed plugin config");
    } catch (err) {
      log.error({ err }, "Failed to refresh plugin config");
    }
  }

  async start() {
    await this._fetchPlugins();
    this._timer = setInterval(() => this._fetchPlugins(), this._refreshInterval);
    log.info({ interval: this._refreshInterval }, "Config store polling started");
  }

  async stop() {
    if (this._timer) clearInterval(this._timer);
    await this._pool.end();
    log.info("Config store stopped");
  }

  getPluginConfig(pluginName) {
    return this._cache.get(pluginName) || null;
  }

  allConfigs() {
    return Object.fromEntries(this._cache);
  }
}

module.exports = ConfigStore;

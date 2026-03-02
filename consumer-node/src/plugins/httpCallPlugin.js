const axios = require("axios");
const BasePlugin = require("../basePlugin");
const pino = require("pino");

const log = pino({ name: "plugin.http_call" });

const DEFAULT_URL = process.env.HTTP_PLUGIN_URL || "http://api:8000/webhook/mock";
const TIMEOUT_MS = 5000;

class HttpCallPlugin extends BasePlugin {
  get name() {
    return "http_call_plugin_node";
  }

  async handle(event, settings) {
    const targetUrl = (settings && settings.target_url) || DEFAULT_URL;
    log.info({ url: targetUrl, event_type: event.event_type }, "POST event");

    const response = await axios.post(targetUrl, event, { timeout: TIMEOUT_MS });
    log.info({ status: response.status, url: targetUrl }, "HTTP response received");
  }
}

module.exports = HttpCallPlugin;

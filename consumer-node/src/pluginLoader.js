const fs = require("fs");
const path = require("path");
const BasePlugin = require("./basePlugin");
const pino = require("pino");

const log = pino({ name: "plugin-loader" });

const PLUGINS_DIR = path.join(__dirname, "plugins");

/**
 * Scan the plugins/ directory, require every .js file, and collect
 * instances of BasePlugin subclasses.  Adding a new plugin is as simple
 * as dropping a new file into plugins/ — no changes needed here.
 */
function discoverPlugins() {
  const instances = [];

  const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith(".js")).sort();

  for (const file of files) {
    const fullPath = path.join(PLUGINS_DIR, file);
    try {
      const PluginClass = require(fullPath);

      if (typeof PluginClass === "function" && PluginClass.prototype instanceof BasePlugin) {
        const instance = new PluginClass();
        instances.push(instance);
        log.info({ plugin: instance.name }, "Loaded plugin");
      }
    } catch (err) {
      log.error({ file, err }, "Failed to load plugin module");
    }
  }

  log.info({ count: instances.length }, "Total plugins discovered");
  return instances;
}

module.exports = { discoverPlugins };

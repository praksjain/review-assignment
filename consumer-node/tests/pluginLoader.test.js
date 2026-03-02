const { discoverPlugins } = require("../src/pluginLoader");
const BasePlugin = require("../src/basePlugin");

describe("pluginLoader", () => {
  test("discovers all bundled plugins", () => {
    const plugins = discoverPlugins();
    expect(plugins.length).toBe(3);
  });

  test("all discovered plugins are BasePlugin instances", () => {
    const plugins = discoverPlugins();
    for (const p of plugins) {
      expect(p).toBeInstanceOf(BasePlugin);
    }
  });

  test("all plugins have unique names", () => {
    const plugins = discoverPlugins();
    const names = plugins.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("expected plugin names are present", () => {
    const plugins = discoverPlugins();
    const names = new Set(plugins.map((p) => p.name));
    expect(names.has("http_call_plugin_node")).toBe(true);
    expect(names.has("db_writer_plugin_node")).toBe(true);
    expect(names.has("event_publisher_plugin_node")).toBe(true);
  });
});

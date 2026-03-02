const DbWriterPlugin = require("../src/plugins/dbWriterPlugin");

describe("DbWriterPlugin", () => {
  let plugin;
  const event = {
    event_type: "item.added",
    transaction_id: "txn-xyz",
    item_id: "ITM-1001",
    quantity: 3,
  };

  beforeEach(() => {
    plugin = new DbWriterPlugin();
  });

  test("name is db_writer_plugin_node", () => {
    expect(plugin.name).toBe("db_writer_plugin_node");
  });

  test("handle runs without error (DB write is done by consumer main loop)", async () => {
    await expect(plugin.handle(event, {})).resolves.toBeUndefined();
  });

  test("handle completes without throwing for valid input", async () => {
    await plugin.handle(event, {});
  });
});

const BasePlugin = require("../src/basePlugin");

class DummyPlugin extends BasePlugin {
  get name() { return "dummy"; }
  async handle(event) { this.lastEvent = event; }
}

describe("BasePlugin", () => {
  test("cannot be used directly without overriding name", () => {
    const base = new BasePlugin();
    expect(() => base.name).toThrow("Plugin must implement the 'name' getter");
  });

  test("cannot be used directly without overriding handle", async () => {
    const base = new BasePlugin();
    await expect(base.handle({})).rejects.toThrow("Plugin must implement handle()");
  });

  test("matches returns true when event_type is in settings list", () => {
    const p = new DummyPlugin();
    const event = { event_type: "payment.completed" };
    const settings = { event_types: ["payment.completed", "item.added"] };
    expect(p.matches(event, settings)).toBe(true);
  });

  test("matches returns false when event_type not in settings list", () => {
    const p = new DummyPlugin();
    const event = { event_type: "employee.login" };
    const settings = { event_types: ["payment.completed"] };
    expect(p.matches(event, settings)).toBe(false);
  });

  test("matches returns true when event_types list is empty", () => {
    const p = new DummyPlugin();
    expect(p.matches({ event_type: "anything" }, { event_types: [] })).toBe(true);
  });

  test("matches returns true when settings has no event_types key", () => {
    const p = new DummyPlugin();
    expect(p.matches({ event_type: "anything" }, {})).toBe(true);
  });
});

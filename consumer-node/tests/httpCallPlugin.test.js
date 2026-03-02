const HttpCallPlugin = require("../src/plugins/httpCallPlugin");

jest.mock("axios", () => ({
  post: jest.fn().mockResolvedValue({ status: 200 }),
}));

const axios = require("axios");

describe("HttpCallPlugin", () => {
  let plugin;
  const event = {
    event_type: "payment.completed",
    transaction_id: "txn-abc",
    amount_paid: 55.0,
  };

  beforeEach(() => {
    plugin = new HttpCallPlugin();
    axios.post.mockClear();
  });

  test("name is http_call_plugin_node", () => {
    expect(plugin.name).toBe("http_call_plugin_node");
  });

  test("handle posts event to target_url from settings", async () => {
    const settings = { target_url: "http://test.example/hook" };
    await plugin.handle(event, settings);
    expect(axios.post).toHaveBeenCalledWith(
      "http://test.example/hook",
      event,
      { timeout: 5000 }
    );
  });

  test("handle uses default URL when no settings provided", async () => {
    await plugin.handle(event, {});
    expect(axios.post).toHaveBeenCalled();
  });

  test("handle propagates HTTP errors", async () => {
    axios.post.mockRejectedValueOnce(new Error("503 Service Unavailable"));
    await expect(plugin.handle(event, {})).rejects.toThrow("503");
  });
});

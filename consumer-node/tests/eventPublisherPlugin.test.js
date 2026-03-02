jest.mock("kafkajs", () => {
  const mockSend = jest.fn().mockResolvedValue({});
  const mockConnect = jest.fn().mockResolvedValue({});
  const mockProducer = { send: mockSend, connect: mockConnect };
  const mockKafka = { producer: () => mockProducer };
  return {
    Kafka: jest.fn(() => mockKafka),
    _mockSend: mockSend,
    _mockConnect: mockConnect,
  };
});

const EventPublisherPlugin = require("../src/plugins/eventPublisherPlugin");
const { _mockSend } = require("kafkajs");

describe("EventPublisherPlugin", () => {
  let plugin;
  const event = {
    event_type: "payment.completed",
    transaction_id: "txn-999",
    amount_paid: 75.0,
  };

  beforeEach(() => {
    plugin = new EventPublisherPlugin();
    _mockSend.mockClear();
  });

  test("name is event_publisher_plugin_node", () => {
    expect(plugin.name).toBe("event_publisher_plugin_node");
  });

  test("handle sends derived event to Kafka", async () => {
    const settings = { derived_event_type: "transaction.verified" };
    await plugin.handle(event, settings);

    expect(_mockSend).toHaveBeenCalledTimes(1);
    const sendArg = _mockSend.mock.calls[0][0];
    expect(sendArg.topic).toBe("pos-derived-events");
    expect(sendArg.messages[0].key).toBe("txn-999");

    const value = JSON.parse(sendArg.messages[0].value);
    expect(value.event_type).toBe("transaction.verified");
    expect(value.transaction_id).toBe("txn-999");
  });

  test("handle uses default derived event type when not in settings", async () => {
    await plugin.handle(event, {});
    const value = JSON.parse(_mockSend.mock.calls[0][0].messages[0].value);
    expect(value.event_type).toBe("transaction.verified");
  });
});

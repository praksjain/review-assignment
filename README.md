# POS Event-Driven Plugin Subsystem

A Point-of-Sale subsystem that processes POS events through a pluggable architecture. Events flow through Apache Kafka and are consumed by parallel Python and Node.js consumers, each equipped with dynamically-loaded plugins that can be toggled and configured in real time via a React dashboard.

## Architecture

```
┌──────────────┐     ┌──────────┐     ┌──────────────────┐
│   Generator   │────▶│  Kafka   │────▶│  Consumer (Py)   │──▶ Plugins
│  (test rig)   │     │          │     └──────────────────┘      │
└──────────────┘     │ pos-events│     ┌──────────────────┐      ├─▶ HTTP POST
                     │ (3 parts) │────▶│  Consumer (Node)  │──▶   ├─▶ DB Write
                     └──────────┘     └──────────────────┘      └─▶ Publish Event
                                                                      │
  ┌───────────┐     ┌──────────┐                                     ▼
  │  Frontend  │────▶│   API    │──▶ PostgreSQL (plugins table)   Kafka
  │  (React)   │     │ (FastAPI)│                              (derived-events)
  └───────────┘     └──────────┘
```

See `docs/architecture.md` and `docs/sequence.md` for detailed Mermaid diagrams.

## Prerequisites

- **Docker** >= 20.10
- **Docker Compose** v2 (bundled with Docker Desktop as `docker compose`)
- ~4 GB free RAM (Kafka + Zookeeper are memory-hungry)

## Quick Start

```bash
# Clone and enter the project
cd pos-system

# Start the entire stack
docker compose up --build

# The frontend is available at http://localhost:3000
# The API is available at http://localhost:8000
# Kafka is available at localhost:29092 (for external tools)
```

The generator publishes 8 complete POS transaction sequences on startup, then exits. Both consumers pick up and process the events through their active plugins.

### Continuous Mode

To keep the generator running and publishing a new transaction every 5 seconds:

```bash
GENERATOR_MODE=continuous docker compose up --build
```

## System Components

| Component          | Port  | Description                                      |
|--------------------|-------|--------------------------------------------------|
| Frontend (React)   | 3000  | Plugin dashboard — toggle and configure plugins   |
| API (FastAPI)      | 8000  | REST API for plugin CRUD + mock webhook endpoint |
| Consumer (Python)  | 8081  | Kafka consumer with 3 plugins, health at /health |
| Consumer (Node.js) | 8082  | Kafka consumer with 3 plugins, health at /health |
| Kafka              | 29092 | External listener for debugging tools            |
| PostgreSQL         | 5432  | Plugin config + event log                        |
| Redis              | 6379  | Used by plugins for caching/counters             |

## Plugin Architecture

Both consumers share the same plugin model:

1. **BasePlugin** — abstract class with `name`, `handle(event)`, and `matches(event, settings)`
2. **Plugin Loader** — scans a `plugins/` directory, dynamically imports all concrete `BasePlugin` subclasses
3. **Config Store** — polls PostgreSQL every 5 seconds for plugin `is_active` and `settings`
4. **Consumer Loop** — for each Kafka event, iterates plugins, checks `is_active` + `matches()`, calls `handle()`

### Bundled Plugins

| Plugin               | Action                                                      |
|----------------------|-------------------------------------------------------------|
| HTTP Call Plugin     | POSTs event payload to a configurable URL                   |
| DB Writer Plugin     | Inserts event into `event_log` table in PostgreSQL          |
| Event Publisher      | Publishes a derived event (e.g. `transaction.verified`) to Kafka |

### Adding a New Plugin

1. Create a new file in `consumer-python/plugins/` or `consumer-node/src/plugins/`
2. Extend `BasePlugin`, implement `name` and `handle(event, settings)`
3. Add a row to the `plugins` table (via the API or directly in `db/init.sql`)
4. Restart the consumer — the plugin is discovered automatically

**No changes to the core consumer code are required.**

## Event Types (Test Rig)

The generator produces a complete POS transaction lifecycle:

| Order | Event Type             | Key Fields                                          |
|-------|------------------------|-----------------------------------------------------|
| 1     | `employee.login`       | employee_id, store_id, terminal_id                  |
| 2     | `transaction.started`  | transaction_id, employee_id, store_id, terminal_id  |
| 3     | `customer.identified`  | transaction_id, customer_id                         |
| 4     | `item.added` (x2-5)   | transaction_id, item_id, sku, quantity, price        |
| 5     | `transaction.subtotal` | transaction_id, subtotal, tax, total                |
| 6     | `payment.completed`    | transaction_id, payment_method, amount_paid          |
| 7     | `employee.logout`      | employee_id, store_id, terminal_id                  |

All events within a transaction share the same `transaction_id` as the Kafka partition key, guaranteeing ordering per entity.

## Error Handling

- **Retry**: Each plugin execution is wrapped with exponential backoff (1s → 2s → 4s, max 3 attempts)
- **Dead-Letter Queue**: After retry exhaustion, the event + error metadata is published to `pos-events-dlq`
- **Structured Logging**: JSON-formatted logs (Python: structlog, Node.js: pino) for all important steps

### Verifying events on the DLQ topic

Failed events are written to the Kafka topic **`pos-events-dlq`**. Each message value is a JSON envelope:

```json
{
  "original_event": { "event_type": "...", "transaction_id": "...", ... },
  "plugin_name": "http_call",
  "error": "Connection refused",
  "consumer": "python"
}
```

**Option 1 — Console consumer (Docker Compose)**  
With the stack running:

```bash
docker compose run --rm kafka kafka-console-consumer \
  --bootstrap-server kafka:9092 \
  --topic pos-events-dlq \
  --from-beginning
```

**Option 2 — From the host**  
If Kafka is exposed on `localhost:29092` and you have Kafka CLI tools:

```bash
kafka-console-consumer --bootstrap-server localhost:29092 --topic pos-events-dlq --from-beginning
```

**Option 3 — Script**  
From the project root: `./scripts/verify-dlq.sh` (see that file for the exact command).

## API Endpoints

| Method | Path              | Description                          |
|--------|-------------------|--------------------------------------|
| GET    | `/plugins`        | List all plugins (optional `?consumer=python`) |
| GET    | `/plugins/{id}`   | Get a single plugin                  |
| PUT    | `/plugins/{id}`   | Update `is_active` and/or `settings` |
| GET    | `/events`         | Recent entries from `event_log`      |
| GET    | `/health`         | API health check                     |
| POST   | `/webhook/mock`   | Mock sink for the HTTP Call Plugin   |

## Testing

### Unit Tests (Python)

```bash
cd consumer-python
pip install -r requirements.txt
pytest -v
```

### Unit Tests (Node.js)

```bash
cd consumer-node
npm install
npm test
```

### Integration Tests (Docker)

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

## Design Decisions

1. **Separate consumer groups** — Python and Node.js consumers use different Kafka group IDs so both receive all events, demonstrating polyglot event processing.

2. **Polling-based config refresh** — The config store polls PostgreSQL every 5 seconds rather than using WebSockets or Kafka for config changes. This keeps the implementation simple and reliable; the 5-second lag is acceptable for a plugin toggle use case.

3. **Separate API service** — Plugin management is decoupled from the consumers. The API writes to PostgreSQL; consumers read from it independently. This means the consumers never need to expose HTTP endpoints for config changes.

4. **Filesystem-based plugin discovery** — Plugins are loaded by scanning a directory. Adding a new plugin is a single file drop — no registration step or manifest file required.

5. **Transaction ID as partition key** — All events for a given POS transaction go to the same Kafka partition, guaranteeing strict ordering per transaction.

## Idempotency Considerations

This demo does not implement idempotency checks. In a production system, you would:

- Assign a unique `event_id` (UUID) to each event at the generator
- Maintain a processed-event deduplication table or Redis set
- Before processing, check if the `event_id` was already handled
- Use Kafka consumer offsets and transactional writes for exactly-once semantics

## Security Notes

This is a demo system with no authentication or authorization. In production:

- API endpoints should require JWT/OAuth2 tokens
- Kafka should use SASL/SSL authentication
- PostgreSQL should use strong passwords and TLS
- Redis should require authentication and encryption in transit
- The frontend should authenticate users before allowing plugin changes

## Project Structure

```
pos-system/
├── docker-compose.yml          # Full stack orchestration
├── docker-compose.test.yml     # Test-only services
├── .env                        # Configuration variables
├── db/init.sql                 # Database schema + seed data
├── docs/                       # Architecture & sequence diagrams
├── generator/                  # Python event test rig
├── api/                        # FastAPI plugin management service
├── consumer-python/            # Python Kafka consumer + plugins
├── consumer-node/              # Node.js Kafka consumer + plugins
└── frontend/                   # React plugin dashboard
```

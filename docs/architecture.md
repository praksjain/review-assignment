# POS System — Architecture & Flows

This document describes the **whole architecture** of the Tote POS system: components, data flows, API, database, and deployment. Every flow is covered so the system can be explained to anyone.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Diagram](#2-component-diagram)
3. [Infrastructure & Deployment](#3-infrastructure--deployment)
4. [Kafka Topics](#4-kafka-topics)
5. [API Reference](#5-api-reference)
6. [Database (ER)](#6-database-er)
7. [Event Types & Producers](#7-event-types--producers)
8. [Consumer & Plugin Flow](#8-consumer--plugin-flow)
9. [Sequence Flows](#9-sequence-flows)
10. [Diagram Files (PlantUML)](#10-diagram-files-plantuml)

---

## 1. System Overview

The **POS (Point of Sale) system** is an event-driven application that:

- **Produces** POS events (login, transaction start, items, payment, etc.) from:
  - A **React frontend** (user-driven POS terminal and login)
  - A **test Generator** (automated full transaction sequences)
- **Streams** events through **Apache Kafka** (`pos-events` topic).
- **Consumes** events with two independent runtimes (**Python** and **Node.js**), each running **plugins** (HTTP Call, DB Writer, Event Publisher).
- **Stores** plugin configuration and event execution log in **PostgreSQL**; failed events go to a **Dead Letter** topic.
- **Exposes** a **FastAPI** backend for auth, plugin CRUD, event log, and POS terminal endpoints.

No flow is synchronous end-to-end: the API publishes to Kafka and returns; consumers process asynchronously and write to DB or call webhooks.

---

## 2. Component Diagram

High-level building blocks:

| Layer | Components | Purpose |
|-------|------------|--------|
| **Frontend** | React SPA (Vite), nginx | Login, Dashboard, POS Terminal UI, Plugin list, Event log. Calls API with JWT. |
| **API** | FastAPI (api/) | Auth (login, refresh, /me), Plugins CRUD, Events list/delete, POS terminal endpoints, health, mock webhook. Publishes to Kafka. |
| **Generator** | Python (generator/) | Test rig: generates full transaction sequences (login → items → payment → logout), publishes to `pos-events`. Burst or continuous mode. |
| **Consumers** | consumer-python, consumer-node | Subscribe to `pos-events`; run plugins; write to `event_log`; send failures to DLQ. Each has its own consumer group. |
| **Plugins** | HTTP Call, DB Writer, Event Publisher (×2 runtimes) | Filter by `event_types`; HTTP Call POSTs to URL; DB Writer is no-op (consumer logs); Event Publisher produces to `pos-derived-events`. |
| **Infrastructure** | Zookeeper, Kafka, PostgreSQL, Redis | Kafka coordination; event bus; persistent config & event log; Redis available for cache/counters. |

**Diagram file:** [diagrams/architecture.puml](diagrams/architecture.puml) — full component view with all connections.

---

## 3. Infrastructure & Deployment

- **Orchestration:** `docker-compose.yml` runs the full stack.
- **Services:**
  - **zookeeper** (2181) — Kafka coordination.
  - **kafka** (9092, 29092) — broker; topics created by **kafka-init**.
  - **postgres** (5433→5432) — DB with `db/init.sql` mounted for schema + seed.
  - **redis** (6379) — cache.
  - **api** (8000) — FastAPI; `POSTGRES_HOST=localhost`.
  - **consumer-python** — health on 8081; env from `.env`.
  - **consumer-node** — health on 8082.
  - **generator** — no port; runs burst then optionally continuous.
  - **frontend** (3000→80) — built React served by nginx.

- **Dependencies:** API and consumers wait for postgres/kafka (and kafka-init for consumers/generator). Consumers also wait for api (for HTTP plugin target).

---

## 4. Kafka Topics

| Topic | Partitions | Retention | Producers | Consumers |
|-------|------------|-----------|-----------|-----------|
| **pos-events** | 3 | 1 hour | API (login + POS), Generator | consumer-python, consumer-node |
| **pos-derived-events** | 3 | 1 hour | Event Publisher plugins (Python & Node) | (none in repo; for downstream use) |
| **pos-events-dlq** | 1 | 24 hours | consumer-python, consumer-node (on final failure) | (none in repo; for inspection/replay) |

Messages are keyed by `transaction_id` or `employee_id` for ordering within a partition.

---

## 5. API Reference

All base URL: `http://localhost:8000` (or API service host). Auth: `Authorization: Bearer <access_token>` unless noted.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Liveness; `{"status":"ok"}`. |
| POST | `/webhook/mock` | — | Mock webhook sink; body: JSON (e.g. `event_type`); returns `{received, event_type}`. |
| POST | `/auth/login` | — | Body: `username`, `password`. Returns tokens + user; publishes `employee.login` to Kafka. |
| POST | `/auth/refresh` | — | Body: `refresh_token`. Returns new access + refresh tokens; revokes old token. |
| GET | `/auth/me` | Bearer | Current user: `employee_id`, `username`, `roles`. |
| GET | `/plugins` | Bearer | List plugins; optional `?consumer=python` or `?consumer=node`. |
| GET | `/plugins/{id}` | Bearer | Get one plugin by id. |
| PUT | `/plugins/{id}` | Bearer + ADMIN | Update `is_active` and/or `settings`. |
| GET | `/events` | Bearer | Recent `event_log` rows; `?limit=1..500` (default 50). |
| DELETE | `/events` | Bearer + ADMIN | Delete all rows in `event_log`; returns `{deleted: count}`. |
| POST | `/pos/transaction/start` | Bearer | Body: `store_id`, `terminal_id`. Returns `transaction_id` + event; publishes `transaction.started`. |
| POST | `/pos/transaction/customer` | Bearer | Body: `transaction_id`, `customer_id`, `customer_name`. Publishes `customer.identified`. |
| POST | `/pos/transaction/item` | Bearer | Body: `transaction_id`, `item_name`, `sku`, `quantity`, `unit_price`, `category`. Publishes `item.added`. |
| POST | `/pos/transaction/subtotal` | Bearer | Body: `transaction_id`, `subtotal`, `tax_rate`. Publishes `transaction.subtotal`. |
| POST | `/pos/transaction/pay` | Bearer | Body: `transaction_id`, `payment_method`, `amount_due`. Publishes `payment.completed`. |

---

## 6. Database (ER)

**Schema source:** `db/init.sql`.

### Auth

- **roles** — `id` (PK), `name` (UNIQUE). Seed: ADMIN, EMPLOYEE.
- **employees** — `id` (PK), `username` (UNIQUE), `password_hash`, `display_name`, `created_at`, `updated_at`.
- **employee_roles** — `(employee_id, role_id)` PK; FKs → `employees(id)`, `roles(id)` ON DELETE CASCADE.
- **refresh_tokens** — `id` (PK), `employee_id` (FK→employees), `token_hash`, `expires_at`, `revoked`, `created_at`; indexes on `employee_id`, `token_hash`.

### Plugins & Events

- **plugins** — `id` (PK), `name` (UNIQUE), `is_active`, `settings` (JSONB), `consumer` (`'python'` | `'node'`), `description`, `created_at`, `updated_at`. Seeded with 3 Python and 3 Node plugins.
- **event_log** — `id` (PK), `event_type`, `transaction_id`, `payload` (JSONB), `plugin_name`, `consumer`, `processed_at`. Written by consumers after each successful plugin run.
- **dead_letter_events** — `id` (PK), `event_type`, `payload` (JSONB), `error_message`, `plugin_name`, `failed_at`. (Schema only; DLQ currently writes to Kafka, not this table.)

**ER diagram:** [diagrams/er-database.puml](diagrams/er-database.puml) (entity-relationship: tables and FKs).

---

## 7. Event Types & Producers

### Event types (on `pos-events`)

| Event Type | Producer | When |
|------------|----------|------|
| employee.login | API (auth_routes), Generator | After successful login / session start |
| employee.logout | Generator only | End of generated session |
| transaction.started | API (event_routes), Generator | Start transaction |
| customer.identified | API, Generator | Customer linked to transaction |
| item.added | API, Generator | Line item added |
| transaction.subtotal | API, Generator | Subtotal/tax/total calculated |
| payment.completed | API, Generator | Payment finalized |
| transaction.verified | Event Publisher plugin | Derived event on `pos-derived-events` (when source is e.g. payment.completed) |

### Producers

- **API** — Publishes to `pos-events` from login and from each `/pos/transaction/*` call; key = `transaction_id` or `employee_id`.
- **Generator** — Produces full sequence per transaction: `employee.login` → `transaction.started` → `customer.identified` → N× `item.added` → `transaction.subtotal` → `payment.completed` → `employee.logout`; key = `transaction_id` or `employee_id`.

---

## 8. Consumer & Plugin Flow

Both **consumer-python** and **consumer-node** follow the same flow:

1. **ConfigStore** — Background thread polls `plugins` table (filter `consumer = 'python'` or `'node'`) every **CONFIG_REFRESH_INTERVAL** (default 5s); caches by plugin `name`: `id`, `is_active`, `settings`.
2. **Consume** — Subscribe to `pos-events` in group `pos-consumer-python` or `pos-consumer-node`; each message is one event (JSON).
3. **For each event** — For each loaded plugin:
   - Get config from ConfigStore; skip if missing or `!is_active`.
   - If `!plugin.matches(event, settings)` (e.g. `event_type` not in `settings.event_types` when list non-empty), skip.
   - Call `plugin.handle(event, settings)` with **retry**: 3 attempts, backoff 1s, 2s, 4s.
   - **On success:** insert into **event_log** (event_type, transaction_id, payload, plugin_name, consumer).
   - **On final failure:** produce to **pos-events-dlq** (envelope: original_event, plugin_name, error, consumer).
4. **Plugins:**
   - **HTTP Call** — If event type in `settings.event_types`, POST full event to `settings.target_url` (default API `/webhook/mock`).
   - **DB Writer** — `matches` all events (empty `event_types`); `handle` is no-op; persistence is the consumer’s `event_log` insert after every successful plugin.
   - **Event Publisher** — For matching types (e.g. `payment.completed`), build derived event (`settings.derived_event_type`, default `transaction.verified`) and produce to **pos-derived-events**.

**Sequence diagram:** [diagrams/sequence-consumer-event.puml](diagrams/sequence-consumer-event.puml).

---

## 9. Sequence Flows

These cover every major flow so nothing is missed.

| Flow | Description | Diagram |
|------|-------------|---------|
| **Login** | User → Frontend → POST /auth/login → API validates vs employees/roles, creates tokens, inserts refresh_tokens, publishes employee.login → Kafka; returns tokens to frontend. | [sequence-login.puml](diagrams/sequence-login.puml) |
| **Refresh token** | 401 on API → Frontend POST /auth/refresh with refresh_token → API validates token in DB, revokes old, issues new tokens. | [sequence-refresh-token.puml](diagrams/sequence-refresh-token.puml) |
| **POS transaction (UI)** | User in PosTerminal: Start → Customer → Items → Subtotal → Pay; each step is POST /pos/transaction/* → API publishes one event to Kafka → response to UI. Consumers process asynchronously. | [sequence-pos-transaction.puml](diagrams/sequence-pos-transaction.puml) |
| **Plugin config** | Admin opens Plugins → GET /plugins; toggles/edits → PUT /plugins/{id} → API updates DB. ConfigStore in consumers refreshes within ~5s; next events use new config. | [sequence-plugin-config.puml](diagrams/sequence-plugin-config.puml) |
| **Generator** | Generator starts → wait for Kafka → burst: N times generate_transaction_events() and publish_transaction() to pos-events; optional continuous loop. Same consumer pipeline as above. | [sequence-generator.puml](diagrams/sequence-generator.puml) |
| **Consumer event** | Kafka message → parse → for each plugin: config check, match, handle with retry → event_log or DLQ; HTTP Call → API webhook; Event Publisher → pos-derived-events. | [sequence-consumer-event.puml](diagrams/sequence-consumer-event.puml) |

---

## 10. Diagram Files (PlantUML)

All diagrams are in **PlantUML** (`.puml`) and can be rendered with [PlantUML](https://plantuml.com/) or any editor/CI that supports it.

| File | Content |
|------|---------|
| [diagrams/architecture.puml](diagrams/architecture.puml) | Full system component diagram: Frontend, API, Generator, Kafka, Consumers, Plugins, PostgreSQL, Redis. |
| [diagrams/er-database.puml](diagrams/er-database.puml) | Entity-relationship diagram: roles, employees, employee_roles, refresh_tokens, plugins, event_log, dead_letter_events. |
| [diagrams/sequence-login.puml](diagrams/sequence-login.puml) | Sequence: User → Frontend → API → DB + Kafka (employee.login). |
| [diagrams/sequence-refresh-token.puml](diagrams/sequence-refresh-token.puml) | Sequence: 401 → Frontend → API /auth/refresh → DB revoke + new tokens. |
| [diagrams/sequence-pos-transaction.puml](diagrams/sequence-pos-transaction.puml) | Sequence: User POS steps → Frontend → API /pos/* → Kafka; consumers → plugins → event_log / webhook / derived topic. |
| [diagrams/sequence-plugin-config.puml](diagrams/sequence-plugin-config.puml) | Sequence: Admin → Frontend → API GET/PUT plugins → PostgreSQL; ConfigStore poll in consumers. |
| [diagrams/sequence-generator.puml](diagrams/sequence-generator.puml) | Sequence: Generator → Kafka (full transaction sequence); consumers process same as other flows. |
| [diagrams/sequence-consumer-event.puml](diagrams/sequence-consumer-event.puml) | Sequence: Kafka → Consumer → ConfigStore → plugins (match → handle → retry) → event_log or DLQ; HTTP Call and Event Publisher side effects. |

### C4 Model (Context, Container, Component, Code)

The [C4 model](https://c4model.com/) describes the architecture at four levels; each level is in a separate file to avoid overlapping flows and keep diagrams readable.

| File | Level | Content |
|------|--------|---------|
| [C4-Level-1-Context.puml](diagrams/C4-Level-1-Context.puml) | **Context** | System context: Employee, Administrator → POS System; POS System → Message Broker (Kafka), Database (PostgreSQL). Single relationships per actor and per external system. |
| [C4-Level-2-Container.puml](diagrams/C4-Level-2-Container.puml) | **Container** | Containers inside POS System: Web Application, API, Event Generator, Consumer Python, Consumer Node; external Kafka and PostgreSQL. All container-level flows without overlap. |
| [C4-Level-3-API.puml](diagrams/C4-Level-3-API.puml) | **Component** | Components inside the API container: Auth, Plugin Routes, Event Routes, POS Routes, Webhook, Database Adapter, Auth Middleware. |
| [C4-Level-3-Frontend.puml](diagrams/C4-Level-3-Frontend.puml) | **Component** | Components inside the Web Application: Login, Dashboard, POS Terminal, Plugin List, Event Log, Auth Context, API Client. |
| [C4-Level-3-Consumer-Python.puml](diagrams/C4-Level-3-Consumer-Python.puml) | **Component** | Components inside Consumer Python: Config Store, Consumer Loop, Plugin Runner, HTTP Call / DB Writer / Event Publisher plugins, Event Log Writer, DLQ Producer. |
| [C4-Level-3-Consumer-Node.puml](diagrams/C4-Level-3-Consumer-Node.puml) | **Component** | Components inside Consumer Node (same structure as Python). |
| [C4-Level-3-Generator.puml](diagrams/C4-Level-3-Generator.puml) | **Component** | Components inside Event Generator: Main, Event Builder, Kafka Producer. |
| [C4-Level-4-Code-API-Auth.puml](diagrams/C4-Level-4-Code-API-Auth.puml) | **Code** | Code structure for API auth: auth_routes, auth, database, middleware (key functions and request models). |
| [C4-Level-4-Code-Consumer-Plugin.puml](diagrams/C4-Level-4-Code-Consumer-Plugin.puml) | **Code** | Code structure for consumer plugin execution: main, ConfigStore, plugin_loader, BasePlugin, concrete plugins. |

C4 diagrams use the [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) library (included via URL). Level 4 diagrams are standard PlantUML class/module diagrams.

To generate PNG/SVG from a `.puml` file:

```bash
plantuml docs/diagrams/architecture.puml
# or
java -jar plantuml.jar docs/diagrams/*.puml
```

---

*This document and the referenced diagrams together describe the entire POS system architecture and every flow.*

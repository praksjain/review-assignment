CREATE TABLE IF NOT EXISTS roles (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(32) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    display_name  VARCHAR(128),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_roles (
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role_id     INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (employee_id, role_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    token_hash  VARCHAR(256) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_employee ON refresh_tokens(employee_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_employees_username ON employees(username);


CREATE TABLE IF NOT EXISTS plugins (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(128) UNIQUE NOT NULL,
    is_active   BOOLEAN DEFAULT true,
    settings    JSONB DEFAULT '{}'::jsonb,
    consumer    VARCHAR(32) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_log (
    id              SERIAL PRIMARY KEY,
    event_type      VARCHAR(128) NOT NULL,
    transaction_id  VARCHAR(128),
    payload         JSONB NOT NULL,
    plugin_name     VARCHAR(128) NOT NULL,
    consumer        VARCHAR(32) NOT NULL,
    processed_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dead_letter_events (
    id              SERIAL PRIMARY KEY,
    event_type      VARCHAR(128),
    payload         JSONB NOT NULL,
    error_message   TEXT,
    plugin_name     VARCHAR(128),
    failed_at       TIMESTAMPTZ DEFAULT NOW()
);


INSERT INTO plugins (name, is_active, settings, consumer, description) VALUES
(
    'http_call_plugin',
    true,
    '{"event_types": ["payment.completed", "transaction.subtotal"], "target_url": "http://api:8000/webhook/mock"}'::jsonb,
    'python',
    'Posts qualifying event payloads to a configurable HTTP endpoint'
),
(
    'db_writer_plugin',
    true,
    '{"event_types": []}'::jsonb,
    'python',
    'Persists ALL events into the event_log table in PostgreSQL'
),
(
    'event_publisher_plugin',
    true,
    '{"event_types": ["payment.completed"], "derived_event_type": "transaction.verified"}'::jsonb,
    'python',
    'Publishes a derived event back to Kafka when a qualifying event is received'
);


INSERT INTO plugins (name, is_active, settings, consumer, description) VALUES
(
    'http_call_plugin_node',
    true,
    '{"event_types": ["payment.completed", "transaction.subtotal"], "target_url": "http://api:8000/webhook/mock"}'::jsonb,
    'node',
    'Posts qualifying event payloads to a configurable HTTP endpoint (Node.js)'
),
(
    'db_writer_plugin_node',
    true,
    '{"event_types": []}'::jsonb,
    'node',
    'Persists ALL events into the event_log table in PostgreSQL (Node.js)'
),
(
    'event_publisher_plugin_node',
    true,
    '{"event_types": ["payment.completed"], "derived_event_type": "transaction.verified"}'::jsonb,
    'node',
    'Publishes a derived event back to Kafka when a qualifying event is received (Node.js)'
);


INSERT INTO roles (name) VALUES ('ADMIN'), ('EMPLOYEE');

INSERT INTO employees (username, password_hash, display_name) VALUES
(
    'prakhar',
    '$2b$12$N6RxYNTAv9fZ/LPPQ.rKgOuIe8bMDX.6QnBmNodKl8czI2lO3ka7G',
    'Prakhar Jain'
),
(
    'rohil',
    '$2b$12$PfJhpJljZ15mGNG7/zUBhuobjkj/AVNm2ZRnX40qkT1yAsVTiobzy',
    'Rohil Dhaka'
);

INSERT INTO employee_roles (employee_id, role_id) VALUES
(1, 1), (1, 2),
(2, 2);

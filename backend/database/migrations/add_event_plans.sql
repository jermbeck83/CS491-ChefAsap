-- Migration: add_event_plans
-- Adds tables for the Menu & Event Planner LLM feature.
-- Note: This SQL code is run through pgAdmin to manually add the new tables to the existing database. 
-- In a production environment, you would typically use a migration tool like Alembic or Django Migrations to manage database schema changes.

CREATE TABLE IF NOT EXISTS event_plans (
    id                    SERIAL PRIMARY KEY,
    customer_id           INT REFERENCES customers(id),
    conversation_id       UUID NOT NULL,
    event_date            DATE,
    cuisine_type          VARCHAR(64),
    guest_count           INT,
    plan_json             JSONB NOT NULL,
    llm_model             VARCHAR(64),
    llm_input_tokens      INT,
    llm_output_tokens     INT,
    llm_cache_read_tokens INT,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_plan_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    role            VARCHAR(16) NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_plan_messages_conv_time
    ON event_plan_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_event_plans_customer
    ON event_plans (customer_id, created_at DESC);

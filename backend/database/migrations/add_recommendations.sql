-- Recommendation Engine tables
-- Run against the Render Postgres instance before starting the recommendation service.

CREATE TABLE IF NOT EXISTS recommendation_cache (
    id           SERIAL PRIMARY KEY,
    customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    chef_id      INTEGER NOT NULL REFERENCES chefs(id)     ON DELETE CASCADE,
    score        FLOAT   NOT NULL,
    reason_code  VARCHAR(32) NOT NULL,
    rank         INTEGER NOT NULL,
    computed_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (customer_id, chef_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_cache_customer
    ON recommendation_cache (customer_id, rank);
CREATE INDEX IF NOT EXISTS idx_rec_cache_computed
    ON recommendation_cache (computed_at);

CREATE TABLE IF NOT EXISTS recommendation_logs (
    id              SERIAL PRIMARY KEY,
    customer_id     INTEGER REFERENCES customers(id),
    use_case        VARCHAR(32) NOT NULL,
    source_chef_id  INTEGER REFERENCES chefs(id),
    served_chef_ids INTEGER[] NOT NULL,
    served_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_logs_customer_time
    ON recommendation_logs (customer_id, served_at DESC);

ALTER TABLE runs ADD COLUMN execution_backend TEXT NOT NULL DEFAULT 'subscription'
  CHECK (execution_backend IN ('subscription', 'api'));
ALTER TABLE runs ADD COLUMN last_scheduled_at TEXT;
CREATE INDEX runs_execution_capacity_idx ON runs(status, execution_backend, created_at);

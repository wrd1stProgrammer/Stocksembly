CREATE TABLE stock_preparations (
  symbol text PRIMARY KEY,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  error_code text
);
CREATE INDEX stock_preparations_pending ON stock_preparations(available_at, requested_at)
  WHERE status IN ('queued', 'running');
CREATE TABLE shared_source_cache (
  namespace text NOT NULL,
  cache_key text NOT NULL,
  body bytea NOT NULL,
  metadata jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(namespace, cache_key)
);
CREATE INDEX shared_source_cache_expiry ON shared_source_cache(expires_at);

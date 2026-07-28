CREATE TABLE research_requests (
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id) ON DELETE CASCADE,
  principal_id TEXT NOT NULL CHECK (
    length(principal_id) = 64 AND principal_id NOT GLOB '*[^0-9a-f]*'
  ),
  symbol TEXT NOT NULL CHECK (
    length(symbol) BETWEEN 1 AND 5 AND symbol NOT GLOB '*[^A-Z]*'
  ),
  question TEXT NOT NULL CHECK (length(question) <= 4000),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'ko')),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX research_requests_history_idx
  ON research_requests(principal_id, created_at DESC, run_id DESC);

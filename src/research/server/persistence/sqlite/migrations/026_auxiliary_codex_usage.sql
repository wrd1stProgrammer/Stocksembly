CREATE TABLE auxiliary_codex_usage (
  call_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (
    purpose IN ('semantic_news_shortlist', 'semantic_news_detail')
  ),
  model TEXT NOT NULL CHECK (model = 'gpt-5.6-luna'),
  reasoning TEXT NOT NULL CHECK (reasoning = 'low'),
  tool_event_count INTEGER NOT NULL CHECK (tool_event_count >= 0),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  cached_input_tokens INTEGER CHECK (
    cached_input_tokens IS NULL OR cached_input_tokens >= 0
  ),
  cache_write_input_tokens INTEGER CHECK (
    cache_write_input_tokens IS NULL OR cache_write_input_tokens >= 0
  ),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  reasoning_output_tokens INTEGER CHECK (
    reasoning_output_tokens IS NULL OR reasoning_output_tokens >= 0
  ),
  recorded_at TEXT NOT NULL
) STRICT;

CREATE INDEX auxiliary_codex_usage_run_idx
  ON auxiliary_codex_usage(run_id, recorded_at);

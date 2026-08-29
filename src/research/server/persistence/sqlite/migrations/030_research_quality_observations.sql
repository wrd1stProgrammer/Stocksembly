CREATE TABLE research_quality_observations (
  run_id TEXT PRIMARY KEY REFERENCES runs(run_id) ON DELETE CASCADE,
  workflow_version TEXT NOT NULL,
  report_version TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN (
    'complete', 'item_omitted', 'quality_degraded', 'run_failed'
  )),
  observed_at TEXT NOT NULL,
  metrics_json TEXT NOT NULL CHECK (
    json_valid(metrics_json) AND json_type(metrics_json) = 'object'
  ),
  reason_codes_json TEXT NOT NULL CHECK (
    json_valid(reason_codes_json) AND json_type(reason_codes_json) = 'array'
  )
) STRICT;

CREATE INDEX research_quality_observations_outcome_idx
  ON research_quality_observations(outcome, observed_at);

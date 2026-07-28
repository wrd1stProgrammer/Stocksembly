ALTER TABLE jobs ADD COLUMN input_manifest_hash TEXT
  CHECK (input_manifest_hash IS NULL OR (
    length(input_manifest_hash) = 64 AND
    input_manifest_hash NOT GLOB '*[^0-9a-f]*'
  ));

ALTER TABLE attempts ADD COLUMN input_manifest_hash TEXT
  CHECK (input_manifest_hash IS NULL OR (
    length(input_manifest_hash) = 64 AND
    input_manifest_hash NOT GLOB '*[^0-9a-f]*'
  ));

CREATE TABLE agent_runner_evidence (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(attempt_id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  schema_hash TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  binary_hash TEXT NOT NULL,
  cli_version TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  CHECK (length(prompt_hash) = 64 AND prompt_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(schema_hash) = 64 AND schema_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK (length(binary_hash) = 64 AND binary_hash NOT GLOB '*[^0-9a-f]*')
) STRICT;

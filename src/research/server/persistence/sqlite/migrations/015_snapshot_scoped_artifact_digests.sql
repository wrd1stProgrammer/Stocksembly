CREATE TABLE artifacts_v15 (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  media_type TEXT NOT NULL,
  logical_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'
  ),
  created_at TEXT NOT NULL,
  UNIQUE (snapshot_id, content_hash),
  UNIQUE (run_id, logical_key)
) STRICT;

INSERT INTO artifacts_v15
SELECT * FROM artifacts;

DROP TABLE artifacts;
ALTER TABLE artifacts_v15 RENAME TO artifacts;

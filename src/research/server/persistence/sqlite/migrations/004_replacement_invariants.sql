DROP TRIGGER IF EXISTS research_replacement_budget;

CREATE TABLE attempts_v4 (
  attempt_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  kind TEXT NOT NULL CHECK (kind IN ('research', 'qa')),
  status TEXT NOT NULL CHECK (status IN (
    'created', 'spawn-reserved', 'running', 'unknown',
    'succeeded', 'failed', 'cancelled'
  )),
  logical_artifact_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'
  ),
  replacement_of_attempt_id TEXT UNIQUE REFERENCES attempts_v4(attempt_id),
  created_at TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('accepted', 'failed', 'cancelled', 'unknown'))
) STRICT;

INSERT INTO attempts_v4(
  attempt_id, job_id, run_id, snapshot_id, kind, status,
  logical_artifact_key, input_hash, replacement_of_attempt_id,
  created_at, outcome
)
SELECT
  attempt_id, job_id, run_id, snapshot_id, kind, status,
  logical_artifact_key, input_hash, replacement_of_attempt_id,
  created_at, outcome
FROM attempts;

DROP TABLE attempts;
ALTER TABLE attempts_v4 RENAME TO attempts;

CREATE INDEX attempts_recovery_idx ON attempts(status, run_id);

CREATE TRIGGER attempts_match_job_input
BEFORE INSERT ON attempts
BEGIN
  SELECT CASE WHEN NEW.input_hash <> (
    SELECT input_hash FROM jobs WHERE job_id = NEW.job_id
  ) THEN RAISE(ABORT, 'attempt input hash does not match durable job input') END;
END;

CREATE TRIGGER research_replacement_budget
BEFORE INSERT ON attempts
WHEN NEW.replacement_of_attempt_id IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM attempts
    WHERE run_id = NEW.run_id AND replacement_of_attempt_id IS NOT NULL
  ) >= 3 THEN RAISE(ABORT, 'research replacement budget exhausted') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM attempts
    WHERE run_id = NEW.run_id
      AND logical_artifact_key = NEW.logical_artifact_key
  ) >= 2 THEN RAISE(ABORT, 'logical artifact replacement limit exceeded') END;
END;

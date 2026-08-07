ALTER TABLE research_call_ordinals RENAME TO research_call_ordinals_legacy;

CREATE TABLE research_call_ordinals (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 41),
  job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id) ON DELETE CASCADE,
  logical_artifact_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'burned' CHECK (state = 'burned'),
  PRIMARY KEY (run_id, ordinal)
) STRICT;

INSERT INTO research_call_ordinals(
  run_id, ordinal, job_id, attempt_id, logical_artifact_key,
  input_hash, reserved_at, state
)
SELECT run_id, ordinal, job_id, attempt_id, logical_artifact_key,
  input_hash, reserved_at, state
FROM research_call_ordinals_legacy;

DROP TABLE research_call_ordinals_legacy;

ALTER TABLE agent_output_commits RENAME TO agent_output_commits_legacy;

CREATE TABLE agent_output_commits (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(attempt_id),
  artifact_id TEXT NOT NULL UNIQUE REFERENCES artifacts(artifact_id),
  event_id TEXT NOT NULL UNIQUE REFERENCES run_events(event_id),
  owner_id TEXT NOT NULL,
  fence_token INTEGER NOT NULL CHECK (fence_token > 0),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 41),
  output_hash TEXT NOT NULL CHECK (
    length(output_hash) = 64 AND output_hash NOT GLOB '*[^0-9a-f]*'
  ),
  envelope_json TEXT NOT NULL CHECK (json_valid(envelope_json)),
  committed_at TEXT NOT NULL
) STRICT;

INSERT INTO agent_output_commits(
  attempt_id, artifact_id, event_id, owner_id, fence_token,
  ordinal, output_hash, envelope_json, committed_at
)
SELECT attempt_id, artifact_id, event_id, owner_id, fence_token,
  ordinal, output_hash, envelope_json, committed_at
FROM agent_output_commits_legacy;

DROP TABLE agent_output_commits_legacy;

DROP TRIGGER IF EXISTS research_replacement_budget;

CREATE TRIGGER research_replacement_budget
BEFORE INSERT ON attempts
WHEN NEW.replacement_of_attempt_id IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM attempts
    WHERE run_id = NEW.run_id AND replacement_of_attempt_id IS NOT NULL
  ) >= 12 THEN RAISE(ABORT, 'research replacement budget exhausted') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM attempts
    WHERE run_id = NEW.run_id
      AND logical_artifact_key = NEW.logical_artifact_key
  ) >= 4 THEN RAISE(ABORT, 'logical artifact replacement limit exceeded') END;
END;

CREATE TABLE run_stage_recoveries (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_code TEXT NOT NULL,
  next_retry_at TEXT NOT NULL,
  exhausted INTEGER NOT NULL DEFAULT 0 CHECK (exhausted IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, stage),
  CHECK (failure_count >= 0)
) STRICT;

CREATE INDEX run_stage_recoveries_due_idx
  ON run_stage_recoveries(exhausted, next_retry_at);

UPDATE runs
SET requested_replacement_calls = MAX(requested_replacement_calls, 12)
WHERE status IN ('queued', 'running');

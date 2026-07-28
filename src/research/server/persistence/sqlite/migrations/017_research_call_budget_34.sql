ALTER TABLE research_call_ordinals RENAME TO research_call_ordinals_legacy;

CREATE TABLE research_call_ordinals (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 34),
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
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 34),
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

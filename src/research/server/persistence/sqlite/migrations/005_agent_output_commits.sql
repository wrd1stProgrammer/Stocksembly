CREATE TABLE artifact_citation_metadata (
  artifact_id TEXT PRIMARY KEY REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
  locator_json TEXT NOT NULL CHECK (json_valid(locator_json))
) STRICT;

CREATE TABLE job_input_artifacts (
  job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
  PRIMARY KEY (job_id, artifact_id)
) STRICT;

CREATE TABLE agent_output_commits (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(attempt_id),
  artifact_id TEXT NOT NULL UNIQUE REFERENCES artifacts(artifact_id),
  event_id TEXT NOT NULL UNIQUE REFERENCES run_events(event_id),
  owner_id TEXT NOT NULL,
  fence_token INTEGER NOT NULL CHECK (fence_token > 0),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 30),
  output_hash TEXT NOT NULL CHECK (
    length(output_hash) = 64 AND output_hash NOT GLOB '*[^0-9a-f]*'
  ),
  envelope_json TEXT NOT NULL CHECK (json_valid(envelope_json)),
  committed_at TEXT NOT NULL
) STRICT;

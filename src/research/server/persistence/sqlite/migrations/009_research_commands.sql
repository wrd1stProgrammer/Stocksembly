CREATE TABLE report_follow_up_versions (
  report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 1),
  child_run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'allocated' CHECK (
    status IN ('allocated', 'published', 'failed')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (report_id, version)
) STRICT;

CREATE TABLE question_runner_evidence (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(attempt_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL UNIQUE REFERENCES questions(question_id) ON DELETE CASCADE,
  report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  report_version_id TEXT NOT NULL REFERENCES report_versions(version_id),
  report_artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
  report_artifact_digest TEXT NOT NULL CHECK (
    length(report_artifact_digest) = 64
    AND report_artifact_digest NOT GLOB '*[^0-9a-f]*'
  ),
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'
  ),
  prompt_hash TEXT NOT NULL CHECK (
    length(prompt_hash) = 64 AND prompt_hash NOT GLOB '*[^0-9a-f]*'
  ),
  schema_hash TEXT NOT NULL CHECK (
    length(schema_hash) = 64 AND schema_hash NOT GLOB '*[^0-9a-f]*'
  ),
  binary_hash TEXT NOT NULL CHECK (
    length(binary_hash) = 64 AND binary_hash NOT GLOB '*[^0-9a-f]*'
  ),
  cli_version TEXT NOT NULL,
  committed_at TEXT NOT NULL
) STRICT;

CREATE INDEX report_follow_up_versions_child_idx
  ON report_follow_up_versions(child_run_id);

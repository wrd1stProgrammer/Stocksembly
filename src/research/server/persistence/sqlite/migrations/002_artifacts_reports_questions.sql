CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  content_hash TEXT NOT NULL UNIQUE CHECK (
    length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  media_type TEXT NOT NULL,
  logical_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'
  ),
  created_at TEXT NOT NULL,
  UNIQUE (run_id, logical_key)
) STRICT;

CREATE TABLE artifact_edges (
  child_artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
  parent_artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
  relation TEXT NOT NULL,
  PRIMARY KEY (child_artifact_id, parent_artifact_id, relation),
  CHECK (child_artifact_id <> parent_artifact_id)
) STRICT;

CREATE TABLE reports (
  report_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  state TEXT NOT NULL CHECK (state IN ('draft', 'published')),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE report_versions (
  version_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  version INTEGER NOT NULL CHECK (version > 0),
  artifact_id TEXT NOT NULL REFERENCES artifacts(artifact_id),
  status TEXT NOT NULL CHECK (
    status IN ('complete', 'complete_with_limitations', 'incomplete')
  ),
  published_at TEXT NOT NULL,
  public_payload_json TEXT NOT NULL CHECK (json_valid(public_payload_json)),
  UNIQUE (report_id, version)
) STRICT;

CREATE TABLE questions (
  question_id TEXT PRIMARY KEY,
  retry_of_question_id TEXT REFERENCES questions(question_id),
  report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  report_version_id TEXT NOT NULL REFERENCES report_versions(version_id),
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(job_id),
  attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal BETWEEN 1 AND 20),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'spawn_reserved', 'running', 'answered', 'failed')
  ),
  question_json TEXT NOT NULL CHECK (json_valid(question_json)),
  answer_json TEXT CHECK (answer_json IS NULL OR json_valid(answer_json)),
  created_at TEXT NOT NULL,
  UNIQUE (report_id, attempt_ordinal),
  CHECK (question_id <> retry_of_question_id),
  CHECK ((status = 'answered') = (answer_json IS NOT NULL))
) STRICT;

CREATE TABLE question_call_ordinals (
  report_id TEXT NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 20),
  question_id TEXT NOT NULL UNIQUE REFERENCES questions(question_id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id) ON DELETE CASCADE,
  input_hash TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'burned' CHECK (state = 'burned'),
  PRIMARY KEY (report_id, ordinal)
) STRICT;

CREATE INDEX report_versions_history_idx ON report_versions(report_id, version);
CREATE INDEX questions_report_idx ON questions(report_id, attempt_ordinal);

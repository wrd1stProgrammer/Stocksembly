CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL UNIQUE
    REFERENCES snapshots(snapshot_id) DEFERRABLE INITIALLY DEFERRED,
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'running', 'cancelling', 'completed',
    'complete-with-limitations', 'cancelled', 'failed', 'incomplete'
  )),
  last_event_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_event_seq >= 0),
  created_at TEXT NOT NULL,
  report_id TEXT REFERENCES reports(report_id) DEFERRABLE INITIALLY DEFERRED,
  report_published_at TEXT,
  CHECK ((report_id IS NULL) = (report_published_at IS NULL))
) STRICT;

CREATE TABLE snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE
    REFERENCES runs(run_id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  state TEXT NOT NULL CHECK (state IN ('collecting', 'sealed', 'failed')),
  requested_at TEXT NOT NULL,
  evidence_cutoff_at TEXT,
  sealed_at TEXT
) STRICT;

CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  kind TEXT NOT NULL CHECK (kind IN ('research', 'qa')),
  logical_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (
    length(input_hash) = 64 AND input_hash NOT GLOB '*[^0-9a-f]*'
  ),
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'leased', 'spawn-reserved', 'running', 'retry-wait',
    'cancel-requested', 'cancelled', 'succeeded', 'failed'
  )),
  created_at TEXT NOT NULL,
  attempt_id TEXT UNIQUE
    REFERENCES attempts(attempt_id) DEFERRABLE INITIALLY DEFERRED,
  lease_owner TEXT,
  lease_token INTEGER NOT NULL DEFAULT 0 CHECK (lease_token >= 0),
  lease_expires_at TEXT,
  result_artifact_id TEXT
    REFERENCES artifacts(artifact_id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (run_id, logical_key),
  UNIQUE (run_id, input_hash),
  CHECK (
    (lease_owner IS NULL AND lease_expires_at IS NULL) OR
    (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_token > 0)
  )
) STRICT;

CREATE TABLE attempts (
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
  replacement_of_attempt_id TEXT UNIQUE REFERENCES attempts(attempt_id),
  created_at TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('accepted', 'failed', 'cancelled', 'unknown')),
  UNIQUE (job_id, input_hash)
) STRICT;

CREATE TABLE research_call_ordinals (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 30),
  job_id TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id) ON DELETE CASCADE,
  logical_artifact_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'burned' CHECK (state = 'burned'),
  PRIMARY KEY (run_id, ordinal)
) STRICT;

CREATE TABLE run_events (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  state_id TEXT NOT NULL,
  job_id TEXT REFERENCES jobs(job_id),
  attempt_id TEXT REFERENCES attempts(attempt_id),
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  PRIMARY KEY (run_id, sequence)
) STRICT;

CREATE INDEX jobs_ready_idx ON jobs(status, created_at);
CREATE INDEX attempts_recovery_idx ON attempts(status, run_id);
CREATE INDEX run_events_cursor_idx ON run_events(run_id, sequence);

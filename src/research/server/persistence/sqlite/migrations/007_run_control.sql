CREATE TABLE runs_v7 (
  run_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id) DEFERRABLE INITIALLY DEFERRED,
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'running', 'cancelling', 'completed',
    'complete-with-limitations', 'cancelled', 'failed', 'incomplete'
  )),
  last_event_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_event_seq >= 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  remaining_base_calls INTEGER NOT NULL DEFAULT 24 CHECK (remaining_base_calls >= 0),
  requested_optional_calls INTEGER NOT NULL DEFAULT 3 CHECK (requested_optional_calls >= 0),
  requested_replacement_calls INTEGER NOT NULL DEFAULT 3 CHECK (requested_replacement_calls >= 0),
  created_at TEXT NOT NULL,
  report_id TEXT REFERENCES reports(report_id) DEFERRABLE INITIALLY DEFERRED,
  report_published_at TEXT,
  CHECK ((report_id IS NULL) = (report_published_at IS NULL))
) STRICT;

INSERT INTO runs_v7(
  run_id, snapshot_id, status, last_event_seq, created_at,
  report_id, report_published_at
)
SELECT run_id, snapshot_id, status, last_event_seq, created_at,
  report_id, report_published_at FROM runs;

DROP TRIGGER run_events_contiguous;
DROP TABLE runs;
ALTER TABLE runs_v7 RENAME TO runs;

CREATE TRIGGER run_events_contiguous
BEFORE INSERT ON run_events
BEGIN
  SELECT CASE WHEN NEW.sequence <> COALESCE(
    (SELECT MAX(sequence) + 1 FROM run_events WHERE run_id = NEW.run_id), 1
  ) THEN RAISE(ABORT, 'run event sequence is not contiguous') END;
  SELECT CASE WHEN NEW.sequence <> (
    SELECT last_event_seq FROM runs WHERE run_id = NEW.run_id
  ) THEN RAISE(ABORT, 'run event sequence does not match high-water mark') END;
END;

CREATE TABLE run_lineage (
  child_run_id TEXT PRIMARY KEY REFERENCES runs(run_id) ON DELETE CASCADE,
  parent_run_id TEXT NOT NULL REFERENCES runs(run_id),
  kind TEXT NOT NULL CHECK (kind IN ('same-snapshot-retry', 'new-snapshot-follow-up')),
  effective_snapshot_id TEXT NOT NULL REFERENCES snapshots(snapshot_id),
  prior_report_id TEXT REFERENCES reports(report_id),
  created_at TEXT NOT NULL,
  CHECK (child_run_id <> parent_run_id)
) STRICT;

CREATE TABLE run_public_limitations (
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, code)
) STRICT;

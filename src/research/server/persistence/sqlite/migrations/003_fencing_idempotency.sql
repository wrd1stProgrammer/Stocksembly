CREATE TABLE maintenance_leases (
  lease_name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('draining', 'quiesced')),
  fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
  expires_at TEXT NOT NULL,
  maintenance_epoch INTEGER NOT NULL DEFAULT 0 CHECK (maintenance_epoch >= 0),
  completed_at TEXT
) STRICT;

CREATE TABLE idempotency_records (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, idempotency_key)
) STRICT;

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

CREATE TRIGGER research_replacement_budget
BEFORE INSERT ON attempts
WHEN NEW.replacement_of_attempt_id IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM attempts
    WHERE run_id = NEW.run_id AND replacement_of_attempt_id IS NOT NULL
  ) >= 6 THEN RAISE(ABORT, 'research replacement budget exhausted') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM attempts
    WHERE run_id = NEW.run_id
      AND logical_artifact_key = NEW.logical_artifact_key
  ) >= 2 THEN RAISE(ABORT, 'logical artifact replacement limit exceeded') END;
END;

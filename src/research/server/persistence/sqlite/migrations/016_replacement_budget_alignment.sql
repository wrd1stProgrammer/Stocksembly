DROP TRIGGER IF EXISTS research_replacement_budget;

CREATE TRIGGER research_replacement_budget
BEFORE INSERT ON attempts
WHEN NEW.replacement_of_attempt_id IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM attempts
    WHERE run_id = NEW.run_id AND replacement_of_attempt_id IS NOT NULL
  ) >= 5 THEN RAISE(ABORT, 'research replacement budget exhausted') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM attempts
    WHERE run_id = NEW.run_id
      AND logical_artifact_key = NEW.logical_artifact_key
  ) >= 2 THEN RAISE(ABORT, 'logical artifact replacement limit exceeded') END;
END;

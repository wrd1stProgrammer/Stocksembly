DROP TRIGGER IF EXISTS research_replacement_budget;

CREATE TRIGGER research_replacement_budget
BEFORE INSERT ON attempts
WHEN NEW.replacement_of_attempt_id IS NOT NULL
BEGIN
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM attempts
    WHERE run_id = NEW.run_id AND replacement_of_attempt_id IS NOT NULL
  ) >= 12 THEN RAISE(ABORT, 'research replacement budget exhausted') END;

  -- A provider/schema retry starts a new root attempt. Only targeted model
  -- rewrites linked through replacement_of_attempt_id belong to the same
  -- correction chain and should count toward the per-output rewrite limit.
  SELECT CASE WHEN (
    WITH RECURSIVE correction_chain(
      attempt_id, replacement_of_attempt_id
    ) AS (
      SELECT attempt_id, replacement_of_attempt_id
      FROM attempts
      WHERE attempt_id = NEW.replacement_of_attempt_id
        AND run_id = NEW.run_id
        AND logical_artifact_key = NEW.logical_artifact_key
      UNION ALL
      SELECT parent.attempt_id, parent.replacement_of_attempt_id
      FROM attempts parent
      JOIN correction_chain child
        ON parent.attempt_id = child.replacement_of_attempt_id
    )
    SELECT COUNT(*) FROM correction_chain
  ) >= 4 THEN RAISE(ABORT, 'logical artifact replacement limit exceeded') END;
END;

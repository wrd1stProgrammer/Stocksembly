-- Notifications are transaction-bound wake-ups; PostgreSQL remains the event log.
CREATE FUNCTION research.notify_run_event_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('stocksembly_run_events', NEW.run_id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER run_event_notification
AFTER INSERT ON research.run_events
FOR EACH ROW EXECUTE FUNCTION research.notify_run_event_change();

CREATE TRIGGER run_status_notification
AFTER UPDATE OF status ON research.runs
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION research.notify_run_event_change();

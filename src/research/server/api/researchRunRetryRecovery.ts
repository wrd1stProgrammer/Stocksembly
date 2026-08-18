import type Database from "better-sqlite3";

export function requeueInterruptedResearchJobs(
  database: Database.Database,
  runId: string,
): void {
  database
    .prepare(`UPDATE attempts SET status = 'unknown', outcome = 'unknown'
      WHERE run_id = ? AND kind = 'research'
        AND status IN ('spawn-reserved', 'running')`)
    .run(runId);
  database
    .prepare(`UPDATE jobs SET status = 'retry-wait', lease_owner = NULL,
      lease_expires_at = NULL
      WHERE run_id = ? AND kind = 'research'
        AND status IN ('leased', 'spawn-reserved', 'running')`)
    .run(runId);
}

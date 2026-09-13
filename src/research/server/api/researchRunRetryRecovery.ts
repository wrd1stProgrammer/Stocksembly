import type { ResearchDatabase } from "../persistence/postgres/database";

export async function requeueInterruptedResearchJobs(
  database: ResearchDatabase,
  runId: string,
): Promise<void> {
  await database.query(
    `UPDATE attempts SET status = 'unknown', outcome = 'unknown'
      WHERE run_id = $1 AND kind = 'research'
        AND status IN ('spawn-reserved', 'running')`,
    [runId],
  );
  await database.query(
    `UPDATE jobs SET status = 'retry-wait', lease_owner = NULL,
      lease_expires_at = NULL
      WHERE run_id = $1 AND kind = 'research'
        AND status IN ('leased', 'spawn-reserved', 'running')`,
    [runId],
  );
}

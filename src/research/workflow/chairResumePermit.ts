import type { ResearchDatabase } from "../server/persistence/postgres/database";

export async function chairResumeReceiptExceptionAvailable(
  database: ResearchDatabase,
  runId: string,
): Promise<boolean> {
  return (
    (
      await database.query(
        `SELECT 1 FROM runs JOIN jobs USING(run_id)
          JOIN idempotency_records resume ON resume.scope = 'chair-resume'
            AND (resume.result_json::jsonb ->> 'runId') = runs.run_id
          WHERE runs.run_id = $1 AND runs.status = 'running'
            AND runs.report_id IS NULL
            AND jobs.logical_key = 'chair_synthesis:chair'
            AND jobs.status = 'retry-wait'
            AND COALESCE((resume.result_json::jsonb ->> 'receiptExceptionConsumed')::boolean, true) = false
            AND NOT EXISTS (SELECT 1 FROM reports
              WHERE reports.run_id = runs.run_id AND reports.state = 'published')
          LIMIT 1`,
        [runId],
      )
    ).rows[0] !== undefined
  );
}

export async function consumeChairResumeReceiptException(
  database: ResearchDatabase,
  runId: string,
  jobId: string,
): Promise<boolean> {
  const resume = (
    await database.query(
      `SELECT idempotency_key FROM idempotency_records
      WHERE scope = 'chair-resume'
        AND (result_json::jsonb ->> 'runId') = $1 LIMIT 1`,
      [runId],
    )
  ).rows[0] as { readonly idempotency_key: string } | undefined;
  if (resume === undefined) return true;
  return (
    (
      await database.query(
        `UPDATE idempotency_records SET result_json = jsonb_set(result_json::jsonb, '{receiptExceptionConsumed}', 'true'::jsonb)::text
        WHERE scope = 'chair-resume' AND idempotency_key = $1
          AND COALESCE((result_json::jsonb ->> 'receiptExceptionConsumed')::boolean, true) = false
          AND EXISTS (SELECT 1 FROM jobs WHERE job_id = $2
            AND run_id = $3 AND logical_key = 'chair_synthesis:chair'
            AND status = 'leased')`,
        [resume.idempotency_key, jobId, runId],
      )
    ).rowCount === 1
  );
}

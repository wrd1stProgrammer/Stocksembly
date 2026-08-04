import Database from "better-sqlite3";

export function chairResumeReceiptExceptionAvailable(
  databasePath: string,
  runId: string,
): boolean {
  const database = new Database(databasePath, { readonly: true });
  try {
    return (
      database
        .prepare(`SELECT 1 FROM runs JOIN jobs USING(run_id)
          JOIN idempotency_records resume ON resume.scope = 'chair-resume'
            AND json_extract(resume.result_json, '$.runId') = runs.run_id
          WHERE runs.run_id = ? AND runs.status = 'running'
            AND runs.report_id IS NULL
            AND jobs.logical_key = 'chair_synthesis:chair'
            AND jobs.status = 'retry-wait'
            AND COALESCE(json_extract(
              resume.result_json, '$.receiptExceptionConsumed'), 1) = 0
            AND NOT EXISTS (SELECT 1 FROM reports
              WHERE reports.run_id = runs.run_id AND reports.state = 'published')
          LIMIT 1`)
        .get(runId) !== undefined
    );
  } finally {
    database.close();
  }
}

export function consumeChairResumeReceiptException(
  database: Database.Database,
  runId: string,
  jobId: string,
): boolean {
  const resume = database
    .prepare(`SELECT idempotency_key FROM idempotency_records
      WHERE scope = 'chair-resume'
        AND json_extract(result_json, '$.runId') = ? LIMIT 1`)
    .get(runId) as { readonly idempotency_key: string } | undefined;
  if (resume === undefined) return true;
  return (
    database
      .prepare(`UPDATE idempotency_records SET result_json = json_set(
        result_json, '$.receiptExceptionConsumed', json('true'))
        WHERE scope = 'chair-resume' AND idempotency_key = @authorizationId
          AND COALESCE(json_extract(
            result_json, '$.receiptExceptionConsumed'), 1) = 0
          AND EXISTS (SELECT 1 FROM jobs WHERE job_id = @jobId
            AND run_id = @runId AND logical_key = 'chair_synthesis:chair'
            AND status = 'leased')`)
      .run({ authorizationId: resume.idempotency_key, runId, jobId })
      .changes === 1
  );
}

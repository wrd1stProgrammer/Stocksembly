import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import type { ResearchDatabase } from "../persistence/postgres/database";
import {
  RESEARCH_TRANSLATION_SCHEMA_VERSION,
  type TranslatedResearchProjection,
  translatedResearchProjection,
} from "./researchRoomLocalizations";
import { RESEARCH_TRANSLATION_MODEL_VERSION } from "./researchTranslationRunner";

export type ResearchTranslationJobInput = {
  readonly reportId: string;
  readonly runId: string;
  readonly file: Parameters<typeof translatedResearchProjection>[3];
  readonly question: string;
  readonly runDetail: Parameters<typeof translatedResearchProjection>[5];
  readonly conversation: Parameters<typeof translatedResearchProjection>[6];
  readonly sourceLocale: Parameters<typeof translatedResearchProjection>[7];
  readonly targetLocale: Parameters<typeof translatedResearchProjection>[8];
};

type JobRow = {
  job_key: string;
  input_json: ResearchTranslationJobInput;
  status: "queued" | "running" | "succeeded" | "failed";
  result_json: TranslatedResearchProjection | null;
};

export async function requestResearchTranslation(
  database: ResearchDatabase,
  input: ResearchTranslationJobInput,
  retryFailed: boolean,
): Promise<Pick<JobRow, "status" | "result_json">> {
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        model: RESEARCH_TRANSLATION_MODEL_VERSION,
        schema: RESEARCH_TRANSLATION_SCHEMA_VERSION,
        input,
      }),
    )
    .digest("hex");
  const result = await database.query<JobRow>(
    `INSERT INTO research_report_translation_jobs(job_key, report_id, input_json)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (job_key) DO UPDATE SET
       status = CASE WHEN $4 AND research_report_translation_jobs.status = 'failed' THEN 'queued'
         ELSE research_report_translation_jobs.status END,
       updated_at = now()
     RETURNING status, result_json`,
    [key, input.reportId, JSON.stringify(input), retryFailed],
  );
  const row = result.rows[0];
  if (!row) throw new Error("translation_job_missing");
  return row;
}

export async function runResearchTranslationJob(
  database: ResearchDatabase,
  translate = translatedResearchProjection,
): Promise<boolean> {
  const token = randomUUID();
  const claimed = await database.query<JobRow>(
    `UPDATE research_report_translation_jobs SET status = 'running', lease_token = $1,
       lease_until = now() + interval '2 minutes', updated_at = now()
     WHERE job_key = (SELECT job_key FROM research_report_translation_jobs
       WHERE status = 'queued' OR (status = 'running' AND lease_until < now())
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING job_key, input_json`,
    [token],
  );
  const job = claimed.rows[0];
  if (!job) return false;
  const heartbeat = setInterval(() => {
    void database
      .query(
        `UPDATE research_report_translation_jobs SET lease_until = now() + interval '2 minutes'
       WHERE job_key = $1 AND lease_token = $2 AND status = 'running'`,
        [job.job_key, token],
      )
      .catch(() => undefined);
  }, 30_000);
  try {
    const input = job.input_json;
    const result = await translate(
      database,
      input.reportId,
      input.runId,
      input.file,
      input.question,
      input.runDetail,
      input.conversation,
      input.sourceLocale,
      input.targetLocale,
    );
    await database.query(
      `UPDATE research_report_translation_jobs SET status = 'succeeded', result_json = $3::jsonb,
       lease_until = NULL, updated_at = now() WHERE job_key = $1 AND lease_token = $2`,
      [job.job_key, token, JSON.stringify(result)],
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        kind: "research_worker_translation_failed",
        reportId: job.input_json.reportId,
        errorName: error instanceof Error ? error.name : "Unknown",
      })}\n`,
    );
    await database.query(
      `UPDATE research_report_translation_jobs SET status = 'failed', lease_until = NULL,
       updated_at = now() WHERE job_key = $1 AND lease_token = $2`,
      [job.job_key, token],
    );
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

export async function serveResearchTranslations(
  database: ResearchDatabase,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const draining = process.env["STOCKSEMBLY_WORKER_DRAIN_FILE"];
    if (draining && existsSync(draining)) break;
    try {
      if (await runResearchTranslationJob(database)) continue;
    } catch (error) {
      process.stderr.write(
        `${JSON.stringify({
          kind: "research_translation_queue_failed",
          errorName: error instanceof Error ? error.name : "Unknown",
        })}\n`,
      );
    }
    await delay(2_000, undefined, { signal }).catch(() => undefined);
  }
}

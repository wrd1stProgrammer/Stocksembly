import { z } from "zod";
import { AttemptIdSchema, JobIdSchema } from "../../../domain/ids";
import { type ResearchDatabase, researchTransaction } from "./database";
import type { StoredAttempt } from "./types";

const AttemptRowSchema = z.object({
  attempt_id: AttemptIdSchema,
  job_id: JobIdSchema,
  status: z.string(),
  ordinal: z.number().int().positive().nullable(),
  outcome: z.string().nullable(),
});
export async function recoverUncertainAttempts(
  database: ResearchDatabase,
): Promise<readonly string[]> {
  return await researchTransaction(database, async (database) => {
    const rows = (
      await database.query(
        `SELECT attempt_id FROM research.attempts
        WHERE status IN ('spawn-reserved', 'running') ORDER BY created_at, attempt_id`,
        [],
      )
    ).rows;
    await database.query(
      `UPDATE research.attempts SET status = 'unknown', outcome = 'unknown'
        WHERE status IN ('spawn-reserved', 'running')`,
      [],
    );
    await database.query(
      `UPDATE research.jobs SET status = 'retry-wait', lease_owner = NULL,
        lease_expires_at = NULL WHERE attempt_id IN (
          SELECT attempt_id FROM research.attempts WHERE status = 'unknown'
        ) AND status IN ('spawn-reserved', 'running')`,
      [],
    );
    return rows.map((row) => row.attempt_id);
  });
}
export async function findAttempt(
  database: ResearchDatabase,
  attemptId: string,
): Promise<StoredAttempt | undefined> {
  const value = (
    await database.query(
      `SELECT attempts.attempt_id, attempts.job_id, attempts.status,
      attempts.outcome, COALESCE(research_call_ordinals.ordinal,
      question_call_ordinals.ordinal) AS ordinal
      FROM research.attempts
      LEFT JOIN research.research_call_ordinals USING (attempt_id)
      LEFT JOIN research.question_call_ordinals USING (attempt_id)
      WHERE attempts.attempt_id = $1`,
      [attemptId],
    )
  ).rows[0];
  if (value === undefined) return undefined;
  const row = AttemptRowSchema.parse(value);
  return {
    attemptId: row.attempt_id,
    jobId: row.job_id,
    status: row.status,
    ...(row.ordinal === null ? {} : { ordinal: row.ordinal }),
    ...(row.outcome === null ? {} : { outcome: row.outcome }),
  };
}
export async function researchOrdinals(
  database: ResearchDatabase,
  runId: string,
): Promise<readonly number[]> {
  return (
    await database.query(
      `SELECT ordinal FROM research.research_call_ordinals WHERE run_id = $1 ORDER BY ordinal`,
      [runId],
    )
  ).rows.map((row) => row.ordinal);
}

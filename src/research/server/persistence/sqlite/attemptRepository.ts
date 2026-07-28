import type Database from "better-sqlite3";
import { z } from "zod";
import { AttemptIdSchema, JobIdSchema } from "../../../domain/ids";
import type { StoredAttempt } from "./types";

const AttemptRowSchema = z.object({
  attempt_id: AttemptIdSchema,
  job_id: JobIdSchema,
  status: z.string(),
  ordinal: z.number().int().positive().nullable(),
  outcome: z.string().nullable(),
});

export function recoverUncertainAttempts(
  database: Database.Database,
): readonly string[] {
  return database
    .transaction(() => {
      const rows = database
        .prepare<
          [],
          { readonly attempt_id: string }
        >(`SELECT attempt_id FROM attempts
        WHERE status IN ('spawn-reserved', 'running') ORDER BY created_at, attempt_id`)
        .all();
      database
        .prepare(`UPDATE attempts SET status = 'unknown', outcome = 'unknown'
        WHERE status IN ('spawn-reserved', 'running')`)
        .run();
      database
        .prepare(`UPDATE jobs SET status = 'retry-wait', lease_owner = NULL,
        lease_expires_at = NULL WHERE attempt_id IN (
          SELECT attempt_id FROM attempts WHERE status = 'unknown'
        ) AND status IN ('spawn-reserved', 'running')`)
        .run();
      return rows.map((row) => row.attempt_id);
    })
    .immediate();
}

export function findAttempt(
  database: Database.Database,
  attemptId: string,
): StoredAttempt | undefined {
  const value = database
    .prepare(`SELECT attempts.attempt_id, attempts.job_id, attempts.status,
      attempts.outcome, COALESCE(research_call_ordinals.ordinal,
      question_call_ordinals.ordinal) AS ordinal
      FROM attempts
      LEFT JOIN research_call_ordinals USING (attempt_id)
      LEFT JOIN question_call_ordinals USING (attempt_id)
      WHERE attempts.attempt_id = ?`)
    .get(attemptId);
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

export function researchOrdinals(
  database: Database.Database,
  runId: string,
): readonly number[] {
  return database
    .prepare<[string], { readonly ordinal: number }>(
      "SELECT ordinal FROM research_call_ordinals WHERE run_id = ? ORDER BY ordinal",
    )
    .all(runId)
    .map((row) => row.ordinal);
}

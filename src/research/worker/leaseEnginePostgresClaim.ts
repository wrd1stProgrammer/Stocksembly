import { z } from "zod";
import {
  AttemptIdSchema,
  JobIdSchema,
  QuestionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { RESEARCH_EXECUTION_LIMITS } from "../domain/researchExecution";
import {
  type ResearchDatabase,
  researchTransaction,
} from "../server/persistence/postgres/database";
import { researchExecutionCapacity } from "../server/persistence/postgres/runExecutionRepository";
import type { ClaimedJob } from "./leaseEnginePostgresTypes";

const CandidateRowSchema = z.object({
  job_id: JobIdSchema,
  transient_failures: z.coerce.number().int().nonnegative(),
  retry_classification: z.enum(["transient", "repair"]).nullable(),
});
const ClaimRowSchema = z.object({
  job_id: JobIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  kind: z.enum(["research", "qa"]),
  logical_key: z.string(),
  input_hash: z.string(),
  lease_token: z.coerce.number().int().positive(),
  lease_expires_at: z.string(),
  attempt_id: AttemptIdSchema.nullable(),
  question_id: QuestionIdSchema.nullable(),
});

function toClaim(
  row: z.infer<typeof ClaimRowSchema>,
  retry: z.infer<typeof CandidateRowSchema>,
  ownerId: string,
): ClaimedJob {
  return {
    jobId: row.job_id,
    runId: row.run_id,
    snapshotId: row.snapshot_id,
    kind: row.kind,
    logicalKey: row.logical_key,
    inputHash: row.input_hash,
    ownerId,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    transientFailures: retry.transient_failures,
    ...(retry.retry_classification === null
      ? {}
      : { retryClassification: retry.retry_classification }),
    ...(row.attempt_id === null ? {} : { priorAttemptId: row.attempt_id }),
    ...(row.question_id === null ? {} : { questionId: row.question_id }),
  };
}

export async function claimNextJob(
  database: ResearchDatabase,
  ownerId: string,
  now: string,
  expiresAt: string,
): Promise<ClaimedJob | undefined> {
  const value = await researchTransaction(database, async (database) => {
    await database.query("SELECT pg_advisory_xact_lock(73921402)");
    const capacity = researchExecutionCapacity();
    const candidateValue = (
      await database.query(
        `WITH ranked_runs AS (
          SELECT run_id, execution_backend,
            ROW_NUMBER() OVER (PARTITION BY execution_backend ORDER BY created_at, run_id) AS lane_position
          FROM runs WHERE status = 'running'
            AND EXISTS (SELECT 1 FROM jobs pending WHERE pending.run_id = runs.run_id
              AND pending.kind = 'research'
              AND pending.status NOT IN ('cancelled', 'succeeded', 'failed'))
        ), scheduled_research_runs AS (
          SELECT run_id FROM ranked_runs WHERE
            (execution_backend = 'subscription' AND lane_position <= $1)
            OR (execution_backend = 'api' AND lane_position <= $2)
        ) SELECT jobs.job_id,
          COALESCE((retry.result_json::jsonb ->> 'failureCount')::integer, 0)
            AS transient_failures,
          (retry.result_json::jsonb ->> 'classification')
            AS retry_classification
          FROM jobs JOIN runs USING (run_id)
          LEFT JOIN idempotency_records retry
            ON retry.scope = 'worker-retry' AND retry.idempotency_key = jobs.job_id
          WHERE (
            (jobs.kind = 'research' AND jobs.run_id IN (SELECT run_id FROM scheduled_research_runs))
            OR (
              jobs.kind = 'qa'
              AND runs.status IN ('running', 'completed', 'complete-with-limitations')
              AND EXISTS (
                SELECT 1 FROM questions
                JOIN reports USING (report_id)
                WHERE questions.job_id = jobs.job_id AND reports.state = 'published'
              )
            )
          ) AND (SELECT COUNT(*) FROM jobs active
            WHERE active.run_id = jobs.run_id
              AND active.status IN ('leased', 'spawn-reserved', 'running', 'cancel-requested')
              AND active.lease_expires_at > $3) < $4
          AND (jobs.kind <> 'qa' OR (SELECT COUNT(*) FROM jobs active
            WHERE active.kind = 'qa' AND active.status IN ('leased', 'spawn-reserved', 'running', 'cancel-requested')
              AND active.lease_expires_at > $3) < 2)
          AND (
            jobs.status = 'queued'
            OR (jobs.status = 'retry-wait' AND
              COALESCE(CASE WHEN (retry.result_json::jsonb ->> 'circuitOpen')::boolean THEN 1 ELSE 0 END, 0) = 0
              AND
              COALESCE((retry.result_json::jsonb ->> 'retryAt'), '') <= $3)
            OR (jobs.status = 'leased' AND jobs.lease_expires_at <= $3)
          )
          ORDER BY (SELECT COUNT(*) FROM jobs active WHERE active.run_id = jobs.run_id
            AND active.status IN ('leased', 'spawn-reserved', 'running', 'cancel-requested')
            AND active.lease_expires_at > $3),
            runs.last_scheduled_at, jobs.created_at, jobs.job_id LIMIT 1`,
        [
          capacity.subscription,
          capacity.api,
          now,
          RESEARCH_EXECUTION_LIMITS.jobsPerRun,
        ],
      )
    ).rows[0];
    if (candidateValue === undefined) return undefined;
    const candidate = CandidateRowSchema.parse(candidateValue);
    await database.query(
      "SELECT runs.run_id FROM runs JOIN jobs USING (run_id) WHERE jobs.job_id = $1 FOR UPDATE OF runs",
      [candidate.job_id],
    );
    const leased = (
      await database.query(
        `UPDATE jobs SET status = 'leased',
          lease_owner = $1, lease_token = lease_token + 1,
          lease_expires_at = $2
          WHERE job_id = $3 AND (status IN ('queued', 'retry-wait')
            OR (status = 'leased' AND lease_expires_at <= $4))
          RETURNING job_id, run_id, snapshot_id, kind, logical_key, input_hash,
            lease_token, lease_expires_at, attempt_id,
            (SELECT question_id FROM questions
              WHERE questions.job_id = $3) AS question_id`,
        [ownerId, expiresAt, candidate.job_id, now],
      )
    ).rows[0];
    if (leased === undefined) return undefined;
    await database.query(
      `UPDATE runs SET last_scheduled_at = $1
        WHERE run_id = (SELECT run_id FROM jobs WHERE job_id = $2)`,
      [now, candidate.job_id],
    );
    return { leased, candidate };
  });
  return value === undefined
    ? undefined
    : toClaim(
        ClaimRowSchema.parse(value.leased),
        CandidateRowSchema.parse(value.candidate),
        ownerId,
      );
}

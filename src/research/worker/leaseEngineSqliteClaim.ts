import type Database from "better-sqlite3";
import { z } from "zod";
import {
  AttemptIdSchema,
  JobIdSchema,
  QuestionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import type { ClaimedJob } from "./leaseEngineSqliteTypes";
import { LEASE_ENGINE_DEFAULTS } from "./leaseEngineTypes";

const CandidateRowSchema = z.object({
  job_id: JobIdSchema,
  transient_failures: z.number().int().nonnegative(),
  retry_classification: z.enum(["transient", "repair"]).nullable(),
});
const ClaimRowSchema = z.object({
  job_id: JobIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  kind: z.enum(["research", "qa"]),
  logical_key: z.string(),
  input_hash: z.string(),
  lease_token: z.number().int().positive(),
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

export function claimNextJob(
  database: Database.Database,
  ownerId: string,
  now: string,
  expiresAt: string,
): ClaimedJob | undefined {
  const value = database
    .transaction(() => {
      const candidateValue = database
        .prepare(`WITH scheduled_research_runs AS (
          SELECT run_id FROM runs WHERE status = 'running'
            AND EXISTS (SELECT 1 FROM jobs pending WHERE pending.run_id = runs.run_id
              AND pending.kind = 'research'
              AND pending.status NOT IN ('cancelled', 'succeeded', 'failed'))
          ORDER BY created_at, run_id
          LIMIT ${LEASE_ENGINE_DEFAULTS.activeRuns}
        ) SELECT jobs.job_id,
          COALESCE(json_extract(retry.result_json, '$.failureCount'), 0)
            AS transient_failures,
          json_extract(retry.result_json, '$.classification')
            AS retry_classification
          FROM jobs JOIN runs USING (run_id)
          LEFT JOIN idempotency_records retry
            ON retry.scope = 'worker-retry' AND retry.idempotency_key = jobs.job_id
          WHERE (
            (jobs.kind = 'research' AND jobs.run_id IN scheduled_research_runs)
            OR (
              jobs.kind = 'qa'
              AND runs.status IN ('running', 'completed', 'complete-with-limitations')
              AND EXISTS (
                SELECT 1 FROM questions
                JOIN reports USING (report_id)
                WHERE questions.job_id = jobs.job_id AND reports.state = 'published'
              )
            )
          ) AND (
            jobs.status = 'queued'
            OR (jobs.status = 'retry-wait' AND
              COALESCE(json_extract(retry.result_json, '$.circuitOpen'), 0) = 0
              AND
              COALESCE(json_extract(retry.result_json, '$.retryAt'), '') <= @now)
            OR (jobs.status = 'leased' AND jobs.lease_expires_at <= @now)
          )
          ORDER BY jobs.created_at, jobs.job_id LIMIT 1`)
        .get({ now });
      if (candidateValue === undefined) return undefined;
      const candidate = CandidateRowSchema.parse(candidateValue);
      const leased = database
        .prepare(`UPDATE jobs SET status = 'leased',
          lease_owner = @ownerId, lease_token = lease_token + 1,
          lease_expires_at = @expiresAt
          WHERE job_id = @jobId AND (status IN ('queued', 'retry-wait')
            OR (status = 'leased' AND lease_expires_at <= @now))
          RETURNING job_id, run_id, snapshot_id, kind, logical_key, input_hash,
            lease_token, lease_expires_at, attempt_id,
            (SELECT question_id FROM questions
              WHERE questions.job_id = @jobId) AS question_id`)
        .get({
          jobId: candidate.job_id,
          ownerId,
          now,
          expiresAt,
        });
      return leased === undefined ? undefined : { leased, candidate };
    })
    .immediate();
  return value === undefined
    ? undefined
    : toClaim(
        ClaimRowSchema.parse(value.leased),
        CandidateRowSchema.parse(value.candidate),
        ownerId,
      );
}

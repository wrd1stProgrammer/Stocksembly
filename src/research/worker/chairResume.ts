import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { RunIdSchema } from "../domain/ids";
import {
  type ResearchDatabase,
  researchTransaction,
} from "../server/persistence/postgres/database";

const AuthorizationIdSchema = z.string().uuid();
const MAX_PHYSICAL_LAUNCHES = 34;

const EligibilitySchema = z.object({
  status: z.string(),
  research_kind: z.string().nullable(),
  report_id: z.string().nullable(),
  published_reports: z.coerce.number().int().nonnegative(),
  chair_jobs: z.coerce.number().int().nonnegative(),
  retryable_chair_jobs: z.coerce.number().int().nonnegative(),
  failed_chair_attempts: z.coerce.number().int().nonnegative(),
  process_failure_events: z.coerce.number().int().nonnegative(),
  other_unsucceeded_jobs: z.coerce.number().int().nonnegative(),
  memos: z.coerce.number().int().nonnegative(),
  consolidations: z.coerce.number().int().nonnegative(),
  challenges: z.coerce.number().int().nonnegative(),
  ballots: z.coerce.number().int().nonnegative(),
  followups: z.coerce.number().int().nonnegative(),
  semantic_audits: z.coerce.number().int().nonnegative(),
  upstream_without_artifact: z.coerce.number().int().nonnegative(),
  circuit_open: z.coerce.number().int().nullable(),
  failure_count: z.coerce.number().int().nullable(),
  retry_classification: z.string().nullable(),
  retry_code: z.string().nullable(),
  requested_replacement_calls: z.coerce.number().int().nonnegative(),
  remaining_base_calls: z.coerce.number().int().nonnegative(),
  requested_optional_calls: z.coerce.number().int().nonnegative(),
  burned_calls: z.coerce.number().int().nonnegative(),
});

export type ChairResumeRejection =
  | "already_resumed"
  | "circuit_not_retryable"
  | "launch_budget_exhausted"
  | "multiple_chair_jobs"
  | "report_published"
  | "run_missing"
  | "upstream_incomplete"
  | "wrong_stage"
  | "wrong_status"
  | "wrong_target";

export type ChairResumeResult =
  | { readonly kind: "resumed"; readonly grantedLaunch: 0 | 1 }
  | { readonly kind: "already_applied"; readonly grantedLaunch: 0 | 1 }
  | { readonly kind: "rejected"; readonly reason: ChairResumeRejection };

type ChairResumeInput = {
  readonly pool: ResearchDatabase;
  readonly runId: string;
  readonly authorizationId: string;
  readonly now: string;
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function rejected(reason: ChairResumeRejection): ChairResumeResult {
  return { kind: "rejected", reason };
}

export async function resumeCommitteeChair(
  input: ChairResumeInput,
): Promise<ChairResumeResult> {
  const runId = RunIdSchema.parse(input.runId);
  const authorizationId = AuthorizationIdSchema.parse(input.authorizationId);
  const now = z.iso.datetime().parse(input.now);
  const database = input.pool;
  return researchTransaction(database, async (database) => {
    await database.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [runId],
    );
    const replay = (
      await database.query(
        `SELECT result_json FROM idempotency_records
            WHERE scope = 'chair-resume' AND idempotency_key = $1`,
        [authorizationId],
      )
    ).rows[0] as { readonly result_json: string } | undefined;
    if (replay !== undefined) {
      const result = z
        .object({
          runId: RunIdSchema,
          eventId: z.string().uuid(),
          grantedLaunch: z.union([z.literal(0), z.literal(1)]),
          receiptExceptionConsumed: z.boolean().optional(),
        })
        .parse(JSON.parse(replay.result_json));
      if (result.runId !== runId) return rejected("already_resumed");
      const repaired = (
        await database.query(
          `UPDATE runs SET status = 'queued', version = version + 1,
              last_event_seq = last_event_seq + 1
              WHERE run_id = $1 AND status = 'incomplete'
                AND report_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM reports
                  WHERE reports.run_id = runs.run_id AND reports.state = 'published')
                AND EXISTS (SELECT 1 FROM jobs WHERE jobs.run_id = runs.run_id
                  AND jobs.logical_key = 'chair_synthesis:chair'
                  AND jobs.status = 'retry-wait')
                AND EXISTS (SELECT 1 FROM run_events terminal
                  WHERE terminal.run_id = runs.run_id
                    AND terminal.sequence = runs.last_event_seq
                    AND terminal.event_type = 'run_incomplete'
                    AND (terminal.payload_json::jsonb ->> 'code') =
                      'chair_synthesis:replacement_exhausted')
                AND NOT EXISTS (SELECT 1 FROM run_events launch
                  JOIN run_events resume ON resume.event_id = $2
                  WHERE launch.run_id = runs.run_id
                    AND launch.sequence > resume.sequence
                    AND launch.event_type = 'spawn_reserved'
                    AND launch.job_id = (SELECT job_id FROM jobs
                      WHERE run_id = runs.run_id
                        AND logical_key = 'chair_synthesis:chair'))
              RETURNING last_event_seq`,
          [runId, result.eventId],
        )
      ).rows[0] as { readonly last_event_seq: number } | undefined;
      if (repaired !== undefined) {
        await database.query(
          `UPDATE idempotency_records SET result_json = (result_json::jsonb || jsonb_build_object('receiptExceptionConsumed', false))::text
                WHERE scope = 'chair-resume' AND idempotency_key = $1`,
          [authorizationId],
        );
        await database.query(
          `INSERT INTO run_events(run_id, sequence, event_id,
                event_type, state_id, occurred_at, payload_json) VALUES (
                  $1, $2, $3, 'chair_resume_reactivated',
                  'queued', $4, jsonb_build_object('stage', 'chair_synthesis',
                    'authorizationHash', $5::text))`,
          [
            runId,
            repaired.last_event_seq,
            randomUUID(),
            now,
            digest(authorizationId),
          ],
        );
      }
      return { kind: "already_applied", ...result };
    }
    const consumed = (
      await database.query(
        `SELECT 1 FROM idempotency_records
            WHERE scope = 'chair-resume'
              AND (result_json::jsonb ->> 'runId') = $1 LIMIT 1`,
        [runId],
      )
    ).rows[0];
    if (consumed !== undefined) return rejected("already_resumed");

    const raw = (
      await database.query(
        `SELECT runs.status, research_requests.research_kind,
            runs.report_id,
            (SELECT COUNT(*) FROM reports WHERE reports.run_id = runs.run_id
              AND reports.state = 'published') AS published_reports,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND jobs.logical_key LIKE 'chair_synthesis:%') AS chair_jobs,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND jobs.logical_key LIKE 'chair_synthesis:%'
              AND jobs.status = 'retry-wait') AS retryable_chair_jobs,
            (SELECT COUNT(*) FROM attempts JOIN jobs USING(job_id)
              WHERE jobs.run_id = runs.run_id
                AND jobs.logical_key = 'chair_synthesis:chair'
                AND attempts.status = 'failed' AND attempts.outcome = 'failed')
              AS failed_chair_attempts,
            (SELECT COUNT(*) FROM run_events JOIN jobs
              ON jobs.job_id = run_events.job_id
              WHERE jobs.run_id = runs.run_id
                AND jobs.logical_key = 'chair_synthesis:chair'
                AND run_events.event_type = 'attempt_committed'
                AND (run_events.payload_json::jsonb ->> 'code') = 'codex_process_failed')
              AS process_failure_events,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND jobs.logical_key NOT LIKE 'chair_synthesis:%'
              AND jobs.status <> 'succeeded') AS other_unsucceeded_jobs,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND jobs.logical_key LIKE 'memo:%' AND jobs.status = 'succeeded') AS memos,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND jobs.logical_key LIKE 'consolidation:%' AND jobs.status = 'succeeded') AS consolidations,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND jobs.logical_key LIKE 'challenge:%' AND jobs.status = 'succeeded') AS challenges,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND jobs.logical_key LIKE 'response_ballot:%' AND jobs.status = 'succeeded') AS ballots,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND jobs.logical_key LIKE 'followup:%' AND jobs.status = 'succeeded') AS followups,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND jobs.logical_key = 'semantic_audit:system' AND jobs.status = 'succeeded') AS semantic_audits,
            (SELECT COUNT(*) FROM jobs WHERE jobs.run_id = runs.run_id
              AND (jobs.logical_key LIKE 'memo:%'
                OR jobs.logical_key LIKE 'consolidation:%'
                OR jobs.logical_key LIKE 'challenge:%'
                OR jobs.logical_key LIKE 'response_ballot:%'
                OR jobs.logical_key LIKE 'followup:%'
                OR jobs.logical_key = 'semantic_audit:system')
              AND jobs.result_artifact_id IS NULL) AS upstream_without_artifact,
            CASE WHEN (retry.result_json::jsonb ->> 'circuitOpen')::boolean THEN 1 ELSE 0 END AS circuit_open,
            (retry.result_json::jsonb ->> 'failureCount')::integer AS failure_count,
            (retry.result_json::jsonb ->> 'classification') AS retry_classification,
            (retry.result_json::jsonb ->> 'code') AS retry_code,
            runs.requested_replacement_calls, runs.remaining_base_calls,
            runs.requested_optional_calls,
            (SELECT COUNT(*) FROM research_call_ordinals
              WHERE research_call_ordinals.run_id = runs.run_id) AS burned_calls
          FROM runs JOIN research_requests USING(run_id)
          LEFT JOIN jobs chair ON chair.run_id = runs.run_id
            AND chair.logical_key = 'chair_synthesis:chair'
          LEFT JOIN idempotency_records retry ON retry.scope = 'worker-retry'
            AND retry.idempotency_key = chair.job_id
          WHERE runs.run_id = $1`,
        [runId],
      )
    ).rows[0];
    if (raw === undefined) return rejected("run_missing");
    const row = EligibilitySchema.parse(raw);
    if (row.status !== "incomplete") return rejected("wrong_status");
    if (row.research_kind !== "committee") return rejected("wrong_target");
    if (row.report_id !== null || row.published_reports > 0)
      return rejected("report_published");
    if (row.chair_jobs === 0) return rejected("wrong_stage");
    if (row.chair_jobs !== 1 || row.retryable_chair_jobs !== 1)
      return rejected("multiple_chair_jobs");
    if (
      row.other_unsucceeded_jobs !== 0 ||
      row.memos !== 11 ||
      row.consolidations !== 4 ||
      row.challenges !== 4 ||
      row.ballots !== 4 ||
      row.semantic_audits !== 1 ||
      row.upstream_without_artifact !== 0
    )
      return rejected("upstream_incomplete");
    if (
      row.failed_chair_attempts < 1 ||
      row.process_failure_events < 1 ||
      row.circuit_open !== 1 ||
      (row.failure_count ?? 0) < 2 ||
      row.retry_classification !== "transient" ||
      row.retry_code !== "external_dependency_circuit_open"
    )
      return rejected("circuit_not_retryable");

    const grantedLaunch = row.requested_replacement_calls === 0 ? 1 : 0;
    const required =
      row.burned_calls +
      row.remaining_base_calls +
      row.requested_optional_calls +
      row.requested_replacement_calls +
      grantedLaunch;
    if (
      row.burned_calls >= MAX_PHYSICAL_LAUNCHES ||
      required > MAX_PHYSICAL_LAUNCHES
    )
      return rejected("launch_budget_exhausted");

    const updated = (
      await database.query(
        `UPDATE runs SET status = 'queued', version = version + 1,
            last_event_seq = last_event_seq + 1,
            requested_replacement_calls = requested_replacement_calls + $1
            WHERE run_id = $2 AND status = 'incomplete'
            RETURNING last_event_seq`,
        [grantedLaunch, runId],
      )
    ).rows[0] as { readonly last_event_seq: number } | undefined;
    if (updated === undefined) return rejected("wrong_status");
    const recovered = (
      await database.query(
        `UPDATE idempotency_records SET
            result_json = (result_json::jsonb || jsonb_build_object('retryAt', $1::text, 'failureCount', 0, 'circuitOpen', false, 'classification', 'transient'))::text,
            created_at = $1 WHERE scope = 'worker-retry'
              AND idempotency_key = (SELECT job_id FROM jobs
                WHERE run_id = $2 AND logical_key = 'chair_synthesis:chair'
                AND status = 'retry-wait')
              AND COALESCE(CASE WHEN (result_json::jsonb ->> 'circuitOpen')::boolean THEN 1 ELSE 0 END, 0) = 1`,
        [now, runId],
      )
    ).rowCount;
    if (recovered !== 1) throw new Error("chair resume circuit race");

    const eventId = randomUUID();
    await database.query(
      `INSERT INTO run_events(run_id, sequence, event_id,
            event_type, state_id, occurred_at, payload_json)
            VALUES ($1, $2, $3, 'chair_resume_authorized',
              'queued', $4, jsonb_build_object('stage', 'chair_synthesis',
              'grantedLaunch', $5::integer,
              'authorizationHash', $6::text))`,
      [
        runId,
        updated.last_event_seq,
        eventId,
        now,
        grantedLaunch,
        digest(authorizationId),
      ],
    );
    await database.query(
      `INSERT INTO idempotency_records(scope, idempotency_key,
            request_hash, result_json, created_at) VALUES (
              'chair-resume', $1, $2,
              jsonb_build_object('runId', $3::text, 'grantedLaunch', $4::integer,
                'eventId', $5::text,
                'receiptExceptionConsumed', false), $6)`,
      [
        authorizationId,
        digest(`${runId}:${authorizationId}`),
        runId,
        grantedLaunch,
        eventId,
        now,
      ],
    );
    return { kind: "resumed", grantedLaunch };
  });
}

import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { z } from "zod";
import { RunIdSchema } from "../domain/ids";

const AuthorizationIdSchema = z.string().uuid();
const MAX_PHYSICAL_LAUNCHES = 34;

const EligibilitySchema = z.object({
  status: z.string(),
  research_kind: z.string().nullable(),
  report_id: z.string().nullable(),
  published_reports: z.number().int().nonnegative(),
  chair_jobs: z.number().int().nonnegative(),
  retryable_chair_jobs: z.number().int().nonnegative(),
  failed_chair_attempts: z.number().int().nonnegative(),
  process_failure_events: z.number().int().nonnegative(),
  other_unsucceeded_jobs: z.number().int().nonnegative(),
  memos: z.number().int().nonnegative(),
  consolidations: z.number().int().nonnegative(),
  challenges: z.number().int().nonnegative(),
  ballots: z.number().int().nonnegative(),
  followups: z.number().int().nonnegative(),
  semantic_audits: z.number().int().nonnegative(),
  upstream_without_artifact: z.number().int().nonnegative(),
  circuit_open: z.number().int().nullable(),
  failure_count: z.number().int().nullable(),
  retry_classification: z.string().nullable(),
  retry_code: z.string().nullable(),
  requested_replacement_calls: z.number().int().nonnegative(),
  remaining_base_calls: z.number().int().nonnegative(),
  requested_optional_calls: z.number().int().nonnegative(),
  burned_calls: z.number().int().nonnegative(),
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
  readonly databasePath: string;
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

export function resumeCommitteeChair(
  input: ChairResumeInput,
): ChairResumeResult {
  const runId = RunIdSchema.parse(input.runId);
  const authorizationId = AuthorizationIdSchema.parse(input.authorizationId);
  const now = z.iso.datetime().parse(input.now);
  const database = new Database(input.databasePath, { timeout: 5_000 });
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  try {
    return database
      .transaction((): ChairResumeResult => {
        const replay = database
          .prepare(`SELECT result_json FROM idempotency_records
            WHERE scope = 'chair-resume' AND idempotency_key = ?`)
          .get(authorizationId) as { readonly result_json: string } | undefined;
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
          const repaired = database
            .prepare(`UPDATE runs SET status = 'running', version = version + 1,
              last_event_seq = last_event_seq + 1
              WHERE run_id = @runId AND status = 'incomplete'
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
                    AND json_extract(terminal.payload_json, '$.code') =
                      'chair_synthesis:replacement_exhausted')
                AND NOT EXISTS (SELECT 1 FROM run_events launch
                  JOIN run_events resume ON resume.event_id = @resumeEventId
                  WHERE launch.run_id = runs.run_id
                    AND launch.sequence > resume.sequence
                    AND launch.event_type = 'spawn_reserved'
                    AND launch.job_id = (SELECT job_id FROM jobs
                      WHERE run_id = runs.run_id
                        AND logical_key = 'chair_synthesis:chair'))
              RETURNING last_event_seq`)
            .get({ runId, resumeEventId: result.eventId }) as
            | { readonly last_event_seq: number }
            | undefined;
          if (repaired !== undefined) {
            database
              .prepare(`UPDATE idempotency_records SET result_json = json_set(
                result_json, '$.receiptExceptionConsumed', json('false'))
                WHERE scope = 'chair-resume' AND idempotency_key = ?`)
              .run(authorizationId);
            database
              .prepare(`INSERT INTO run_events(run_id, sequence, event_id,
                event_type, state_id, occurred_at, payload_json) VALUES (
                  @runId, @sequence, @eventId, 'chair_resume_reactivated',
                  'running', @now, json_object('stage', 'chair_synthesis',
                    'authorizationHash', @authorizationHash))`)
              .run({
                runId,
                sequence: repaired.last_event_seq,
                eventId: randomUUID(),
                now,
                authorizationHash: digest(authorizationId),
              });
          }
          return { kind: "already_applied", ...result };
        }
        const consumed = database
          .prepare(`SELECT 1 FROM idempotency_records
            WHERE scope = 'chair-resume'
              AND json_extract(result_json, '$.runId') = ? LIMIT 1`)
          .get(runId);
        if (consumed !== undefined) return rejected("already_resumed");

        const raw = database
          .prepare(`SELECT runs.status, research_requests.research_kind,
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
                AND json_extract(run_events.payload_json, '$.code') = 'codex_process_failed')
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
            json_extract(retry.result_json, '$.circuitOpen') AS circuit_open,
            json_extract(retry.result_json, '$.failureCount') AS failure_count,
            json_extract(retry.result_json, '$.classification') AS retry_classification,
            json_extract(retry.result_json, '$.code') AS retry_code,
            runs.requested_replacement_calls, runs.remaining_base_calls,
            runs.requested_optional_calls,
            (SELECT COUNT(*) FROM research_call_ordinals
              WHERE research_call_ordinals.run_id = runs.run_id) AS burned_calls
          FROM runs JOIN research_requests USING(run_id)
          LEFT JOIN jobs chair ON chair.run_id = runs.run_id
            AND chair.logical_key = 'chair_synthesis:chair'
          LEFT JOIN idempotency_records retry ON retry.scope = 'worker-retry'
            AND retry.idempotency_key = chair.job_id
          WHERE runs.run_id = ?`)
          .get(runId);
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

        const updated = database
          .prepare(`UPDATE runs SET status = 'running', version = version + 1,
            last_event_seq = last_event_seq + 1,
            requested_replacement_calls = requested_replacement_calls + @grantedLaunch
            WHERE run_id = @runId AND status = 'incomplete'
            RETURNING last_event_seq`)
          .get({ runId, grantedLaunch }) as
          | { readonly last_event_seq: number }
          | undefined;
        if (updated === undefined) return rejected("wrong_status");
        const recovered = database
          .prepare(`UPDATE idempotency_records SET
            result_json = json_set(result_json,
              '$.retryAt', @now, '$.failureCount', 0,
              '$.circuitOpen', json('false'), '$.classification', 'transient'),
            created_at = @now WHERE scope = 'worker-retry'
              AND idempotency_key = (SELECT job_id FROM jobs
                WHERE run_id = @runId AND logical_key = 'chair_synthesis:chair'
                AND status = 'retry-wait')
              AND COALESCE(json_extract(result_json, '$.circuitOpen'), 0) = 1`)
          .run({ runId, now }).changes;
        if (recovered !== 1) throw new Error("chair resume circuit race");

        const eventId = randomUUID();
        database
          .prepare(`INSERT INTO run_events(run_id, sequence, event_id,
            event_type, state_id, occurred_at, payload_json)
            VALUES (@runId, @sequence, @eventId, 'chair_resume_authorized',
              'running', @now, json_object('stage', 'chair_synthesis',
              'grantedLaunch', @grantedLaunch,
              'authorizationHash', @authorizationHash))`)
          .run({
            runId,
            sequence: updated.last_event_seq,
            eventId,
            now,
            grantedLaunch,
            authorizationHash: digest(authorizationId),
          });
        database
          .prepare(`INSERT INTO idempotency_records(scope, idempotency_key,
            request_hash, result_json, created_at) VALUES (
              'chair-resume', @authorizationId, @requestHash,
              json_object('runId', @runId, 'grantedLaunch', @grantedLaunch,
                'eventId', @eventId,
                'receiptExceptionConsumed', json('false')), @now)`)
          .run({
            authorizationId,
            requestHash: digest(`${runId}:${authorizationId}`),
            runId,
            grantedLaunch,
            eventId,
            now,
          });
        return { kind: "resumed", grantedLaunch };
      })
      .immediate();
  } finally {
    database.close();
  }
}

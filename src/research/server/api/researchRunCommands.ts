import type Database from "better-sqlite3";
import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../../domain/callBudgetContracts";
import { EventIdSchema, RunIdSchema } from "../../domain/ids";
import { appendRunEvent } from "../persistence/sqlite/runRepository";
import { serializeSafeJson } from "../persistence/sqlite/safeJson";
import {
  type CommandIds,
  type CommandResult,
  type RecoveredRun,
  RecoveredRunSchema,
} from "./researchCommandContracts";
import {
  commandDigest,
  commitCommand,
  replayCommand,
} from "./researchCommandIdempotency";
import { requeueInterruptedResearchJobs } from "./researchRunRetryRecovery";

const ParentRowSchema = z.object({
  run_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  status: z.string(),
  version: z.number().int().nonnegative(),
  symbol: z.string(),
  question: z.string(),
  locale: z.enum(["en", "ko"]),
  request_hash: z.string(),
  report_id: z.string().uuid().nullable(),
  research_kind: z.enum(["committee", "department"]),
  department_id: z.enum(["market", "company", "financial", "risk"]).nullable(),
  research_profile_json: z.string(),
});

const RecoveryEligibilitySchema = z.object({
  resumable_jobs: z.number().int().nonnegative(),
  total_research_jobs: z.number().int().nonnegative(),
  succeeded_research_jobs: z.number().int().nonnegative(),
  retryable_failed_jobs: z.number().int().nonnegative(),
});

type CommandContext = {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly ids: CommandIds;
};

export function replayResearchRunRetry(
  database: Database.Database,
  parentRunId: string,
  principalId: string,
  idempotencyKey: string,
):
  | { readonly kind: "missing" | "conflict" }
  | { readonly kind: "replayed"; readonly value: RecoveredRun } {
  const replay = replayCommand(
    database,
    `research-retry:${principalId}:${parentRunId}`,
    idempotencyKey,
    commandDigest({ parentRunId }),
  );
  return replay.kind === "replayed"
    ? { kind: "replayed", value: RecoveredRunSchema.parse(replay.value) }
    : replay;
}

function parentRow(
  database: Database.Database,
  principalId: string,
  runId: string,
): z.infer<typeof ParentRowSchema> | undefined {
  const value = database
    .prepare(`SELECT runs.run_id, runs.snapshot_id, runs.status, runs.version,
      runs.report_id, research_requests.symbol, research_requests.question,
      research_requests.locale, research_requests.request_hash,
      research_requests.research_kind, research_requests.department_id,
      research_requests.research_profile_json
      FROM runs JOIN research_requests USING(run_id)
      WHERE runs.run_id = ? AND research_requests.principal_id = ?`)
    .get(runId, principalId);
  return value === undefined ? undefined : ParentRowSchema.parse(value);
}

export function retryResearchRun(
  database: Database.Database,
  parentRunId: string,
  context: CommandContext,
): CommandResult<RecoveredRun> {
  return database
    .transaction((): CommandResult<RecoveredRun> => {
      const scope = `research-retry:${context.principalId}:${parentRunId}`;
      const requestHash = commandDigest({ parentRunId });
      const replay = replayCommand(
        database,
        scope,
        context.idempotencyKey,
        requestHash,
      );
      if (replay.kind === "conflict") return { kind: "conflict" };
      if (replay.kind === "replayed")
        return {
          kind: "replayed",
          value: RecoveredRunSchema.parse(replay.value),
        };
      const parent = parentRow(database, context.principalId, parentRunId);
      if (parent === undefined) return { kind: "not_found" };
      if (parent.status !== "failed" && parent.status !== "incomplete")
        return { kind: "illegal_state" };
      const rightsFailure = database
        .prepare(`SELECT 1 FROM run_public_limitations
        WHERE run_id = ? AND code = 'rights_failure'`)
        .get(parentRunId);
      if (rightsFailure !== undefined) return { kind: "illegal_state" };
      const recovery = RecoveryEligibilitySchema.parse(
        database
          .prepare(`SELECT
            COUNT(*) FILTER (WHERE kind = 'research'
              AND status IN ('queued', 'leased', 'spawn-reserved', 'running',
                'retry-wait')) AS resumable_jobs,
            COUNT(*) FILTER (WHERE kind = 'research') AS total_research_jobs,
            COUNT(*) FILTER (WHERE kind = 'research'
              AND status = 'succeeded') AS succeeded_research_jobs,
            COUNT(*) FILTER (WHERE kind = 'research' AND status = 'failed'
              AND EXISTS (SELECT 1 FROM idempotency_records retry
                WHERE retry.scope = 'worker-retry'
                  AND retry.idempotency_key = jobs.job_id
                  AND json_extract(retry.result_json, '$.classification') =
                    'transient')) AS retryable_failed_jobs
          FROM jobs WHERE run_id = ?`)
          .get(parentRunId),
      );
      const publicationOnlyRecovery =
        recovery.total_research_jobs > 0 &&
        recovery.succeeded_research_jobs === recovery.total_research_jobs;
      if (
        recovery.resumable_jobs === 0 &&
        recovery.retryable_failed_jobs === 0 &&
        !publicationOnlyRecovery
      )
        return { kind: "illegal_state" };
      const updated = database
        .prepare(`UPDATE runs SET status = 'running', version = version + 1
          WHERE run_id = ? AND status IN ('failed', 'incomplete')
            AND report_id IS NULL`)
        .run(parentRunId).changes;
      if (updated !== 1) return { kind: "illegal_state" };
      requeueInterruptedResearchJobs(database, parentRunId);
      database
        .prepare(`UPDATE jobs SET status = 'retry-wait', lease_owner = NULL,
          lease_expires_at = NULL
          WHERE run_id = @runId AND kind = 'research' AND status = 'failed'
            AND EXISTS (SELECT 1 FROM idempotency_records retry
              WHERE retry.scope = 'worker-retry'
                AND retry.idempotency_key = jobs.job_id
                AND json_extract(retry.result_json, '$.classification') =
                  'transient')`)
        .run({ runId: parentRunId });
      database
        .prepare(`UPDATE idempotency_records SET result_json = json_set(
          result_json, '$.retryAt', @now, '$.failureCount', 0,
          '$.circuitOpen', json('false'), '$.classification', 'transient'),
          created_at = @now
          WHERE scope = 'worker-retry' AND idempotency_key IN (
            SELECT job_id FROM jobs WHERE run_id = @runId
              AND status = 'retry-wait'
          )`)
        .run({ runId: parentRunId, now: context.now });
      database
        .prepare("DELETE FROM run_stage_recoveries WHERE run_id = ?")
        .run(parentRunId);
      appendRunEvent(database, {
        runId: RunIdSchema.parse(parentRunId),
        event: {
          eventId: EventIdSchema.parse(context.ids.eventId),
          type: "runtime_status",
          stateId: "retrying",
          occurredAt: context.now,
          payload: {
            code: "failed_stage_resumed",
            summary: {
              en: "Resuming from the affected research stage.",
              ko: "문제가 생긴 리서치 단계부터 다시 진행합니다.",
            },
          },
        },
      });
      const value = RecoveredRunSchema.parse({
        runId: parentRunId,
        snapshotId: parent.snapshot_id,
        status: "running",
        recovery: "same-run-stage-resume",
      });
      commitCommand(database, {
        scope,
        key: context.idempotencyKey,
        requestHash,
        value: {
          runId: value.runId,
          snapshotId: value.snapshotId,
          status: value.status,
          recovery: value.recovery,
        },
        now: context.now,
      });
      return { kind: "created", value };
    })
    .immediate();
}

type ChildInsert = {
  readonly snapshotId: string;
  readonly lineage: "same-snapshot-retry" | "new-snapshot-follow-up";
  readonly priorReportId: string | null;
  readonly question: string;
};

export function insertChild(
  database: Database.Database,
  parent: z.infer<typeof ParentRowSchema>,
  context: CommandContext,
  input: ChildInsert,
): void {
  const childHash = commandDigest({
    parentRunId: parent.run_id,
    snapshotId: input.snapshotId,
    question: input.question,
    lineage: input.lineage,
  });
  database
    .prepare(`INSERT INTO runs(run_id, snapshot_id, status, last_event_seq,
      created_at, remaining_base_calls, requested_optional_calls,
      requested_replacement_calls) VALUES (?, ?, 'queued', 1, ?, ?, ?, ?)`)
    .run(
      context.ids.runId,
      input.snapshotId,
      context.now,
      CALL_BUDGET_POLICY.mandatoryFirstAttempts,
      CALL_BUDGET_POLICY.maxOptionalFollowups,
      CALL_BUDGET_POLICY.maxRequiredReplacements,
    );
  database
    .prepare(`INSERT INTO jobs(job_id, run_id, snapshot_id, kind, logical_key,
      input_hash, status, created_at) VALUES (?, ?, ?, 'research',
      'collection:initial', ?, 'queued', ?)`)
    .run(
      context.ids.jobId,
      context.ids.runId,
      input.snapshotId,
      childHash,
      context.now,
    );
  database
    .prepare(`INSERT INTO run_events(run_id, sequence, event_id, event_type,
      state_id, occurred_at, payload_json) VALUES (?, 1, ?, 'run_created',
      'run_created', ?, ?)`)
    .run(
      context.ids.runId,
      context.ids.eventId,
      context.now,
      serializeSafeJson({
        schemaVersion: "workflow-v1",
        participantIds: [],
        claimIds: [],
        sourceIds: [],
        limitationIds: [],
      }),
    );
  database
    .prepare(`INSERT INTO research_requests(run_id, principal_id, symbol,
      question, locale, request_hash, created_at, research_kind, department_id,
      research_profile_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      context.ids.runId,
      context.principalId,
      parent.symbol,
      input.question,
      parent.locale,
      childHash,
      context.now,
      parent.research_kind,
      parent.department_id,
      parent.research_profile_json,
    );
  database
    .prepare(`INSERT INTO research_question_localizations(
      run_id, locale, question, created_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(run_id, locale) DO NOTHING`)
    .run(context.ids.runId, parent.locale, input.question, context.now);
  database
    .prepare(`INSERT INTO run_lineage(child_run_id, parent_run_id, kind,
      effective_snapshot_id, prior_report_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(
      context.ids.runId,
      parent.run_id,
      input.lineage,
      input.snapshotId,
      input.priorReportId,
      context.now,
    );
}

export { parentRow };

import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../../domain/callBudgetContracts";
import { EventIdSchema, RunIdSchema } from "../../domain/ids";
import { LIMITS } from "../../domain/limits.constants";
import type { ResearchDatabase } from "../persistence/postgres/database";
import { researchTransaction } from "../persistence/postgres/database";
import { appendRunEvent } from "../persistence/postgres/runRepository";
import { serializeSafeJson } from "../persistence/postgres/safeJson";
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
  failed_research_jobs: z.number().int().nonnegative(),
});

type CommandContext = {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly ids: CommandIds;
};

export async function replayResearchRunRetry(
  database: ResearchDatabase,
  parentRunId: string,
  principalId: string,
  idempotencyKey: string,
): Promise<
  | { readonly kind: "missing" | "conflict" }
  | { readonly kind: "replayed"; readonly value: RecoveredRun }
> {
  const replay = await replayCommand(
    database,
    `research-retry:${principalId}:${parentRunId}`,
    idempotencyKey,
    commandDigest({ parentRunId }),
  );
  return replay.kind === "replayed"
    ? { kind: "replayed", value: RecoveredRunSchema.parse(replay.value) }
    : replay;
}

async function parentRow(
  database: ResearchDatabase,
  principalId: string,
  runId: string,
): Promise<z.infer<typeof ParentRowSchema> | undefined> {
  const value = (
    await database.query(
      `SELECT runs.run_id, runs.snapshot_id, runs.status, runs.version,
      runs.report_id, research_requests.symbol, research_requests.question,
      research_requests.locale, research_requests.request_hash,
      research_requests.research_kind, research_requests.department_id,
      research_requests.research_profile_json
      FROM runs JOIN research_requests USING(run_id)
      WHERE runs.run_id = $1 AND research_requests.principal_id = $2 FOR UPDATE OF runs`,
      [runId, principalId],
    )
  ).rows[0];
  return value === undefined ? undefined : ParentRowSchema.parse(value);
}

export async function retryResearchRun(
  database: ResearchDatabase,
  parentRunId: string,
  context: CommandContext,
): Promise<CommandResult<RecoveredRun>> {
  return await researchTransaction(
    database,
    async (transaction): Promise<CommandResult<RecoveredRun>> => {
      await transaction.query(
        "SELECT pg_advisory_xact_lock(hashtext('research-admission'))",
      );
      const scope = `research-retry:${context.principalId}:${parentRunId}`;
      const requestHash = commandDigest({ parentRunId });
      const replay = await replayCommand(
        transaction,
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
      const parent = await parentRow(
        transaction,
        context.principalId,
        parentRunId,
      );
      if (parent === undefined) return { kind: "not_found" };
      if (parent.status !== "failed" && parent.status !== "incomplete")
        return { kind: "illegal_state" };
      const rightsFailure = (
        await transaction.query(
          `SELECT 1 FROM run_public_limitations
        WHERE run_id = $1 AND code = 'rights_failure'`,
          [parentRunId],
        )
      ).rows[0];
      if (rightsFailure !== undefined) return { kind: "illegal_state" };
      const recovery = RecoveryEligibilitySchema.parse(
        (
          await transaction.query(
            `SELECT
            (COUNT(*) FILTER (WHERE kind = 'research'
              AND status IN ('queued', 'leased', 'spawn-reserved', 'running',
                'retry-wait')))::integer AS resumable_jobs,
            (COUNT(*) FILTER (WHERE kind = 'research'))::integer AS total_research_jobs,
            (COUNT(*) FILTER (WHERE kind = 'research'
              AND status = 'succeeded'))::integer AS succeeded_research_jobs,
            (COUNT(*) FILTER (WHERE kind = 'research' AND status = 'failed'
              AND EXISTS (SELECT 1 FROM idempotency_records retry
                WHERE retry.scope = 'worker-retry'
                  AND retry.idempotency_key = jobs.job_id
                  AND (retry.result_json::jsonb ->> 'classification') =
                    'transient')))::integer AS retryable_failed_jobs,
            (COUNT(*) FILTER (WHERE kind = 'research'
              AND status = 'failed'))::integer AS failed_research_jobs
          FROM jobs WHERE run_id = $1`,
            [parentRunId],
          )
        ).rows[0],
      );
      const publicationOnlyRecovery =
        recovery.total_research_jobs > 0 &&
        recovery.succeeded_research_jobs === recovery.total_research_jobs;
      if (
        recovery.resumable_jobs === 0 &&
        recovery.retryable_failed_jobs === 0 &&
        recovery.failed_research_jobs === 0 &&
        !publicationOnlyRecovery
      )
        return { kind: "illegal_state" };
      const used = z
        .object({ count: z.number().int().nonnegative() })
        .parse(
          (
            await transaction.query(
              "SELECT CAST(COUNT(*) AS integer) AS count FROM research_call_ordinals WHERE run_id=$1",
              [parentRunId],
            )
          ).rows[0],
        );
      if (
        !publicationOnlyRecovery &&
        used.count >= CALL_BUDGET_POLICY.maxPhysicalLaunches
      )
        return { kind: "budget_exhausted" };
      const queued = z
        .object({ count: z.number().int().nonnegative() })
        .parse(
          (
            await transaction.query(
              "SELECT CAST(COUNT(*) AS integer) AS count FROM runs WHERE status = 'queued'",
              [],
            )
          ).rows[0],
        );
      if (queued.count >= LIMITS.admission.queuedRuns)
        return { kind: "queue_full" };
      const updated = (
        await transaction.query(
          `UPDATE runs SET status = 'queued', version = version + 1
          WHERE run_id = $1 AND status IN ('failed', 'incomplete')
            AND report_id IS NULL`,
          [parentRunId],
        )
      ).rowCount;
      if (updated !== 1) return { kind: "illegal_state" };
      await requeueInterruptedResearchJobs(transaction, parentRunId);
      await transaction.query(
        `UPDATE jobs SET status = 'retry-wait', lease_owner = NULL,
          lease_expires_at = NULL
          WHERE run_id = $1 AND kind = 'research' AND status = 'failed'`,
        [parentRunId],
      );
      await transaction.query(
        `UPDATE idempotency_records SET result_json = (result_json::jsonb || jsonb_build_object('retryAt', $1::text, 'failureCount', 0, 'circuitOpen', false, 'classification', 'transient'))::text,
          created_at = $1
          WHERE scope = 'worker-retry' AND idempotency_key IN (
            SELECT job_id FROM jobs WHERE run_id = $2
              AND status = 'retry-wait'
          )`,
        [context.now, parentRunId],
      );
      await transaction.query(
        "DELETE FROM run_stage_recoveries WHERE run_id = $1",
        [parentRunId],
      );
      await appendRunEvent(transaction, {
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
        status: "queued",
        recovery: "same-run-stage-resume",
      });
      await commitCommand(transaction, {
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
    },
  );
}

type ChildInsert = {
  readonly snapshotId: string;
  readonly lineage: "same-snapshot-retry" | "new-snapshot-follow-up";
  readonly priorReportId: string | null;
  readonly question: string;
};

export async function insertChild(
  database: ResearchDatabase,
  parent: z.infer<typeof ParentRowSchema>,
  context: CommandContext,
  input: ChildInsert,
): Promise<void> {
  const childHash = commandDigest({
    parentRunId: parent.run_id,
    snapshotId: input.snapshotId,
    question: input.question,
    lineage: input.lineage,
  });
  await database.query(
    `INSERT INTO runs(run_id, snapshot_id, status, last_event_seq,
      created_at, remaining_base_calls, requested_optional_calls,
      requested_replacement_calls) VALUES ($1, $2, 'queued', 1, $3, $4, $5, $6)`,
    [
      context.ids.runId,
      input.snapshotId,
      context.now,
      CALL_BUDGET_POLICY.mandatoryFirstAttempts,
      CALL_BUDGET_POLICY.maxOptionalFollowups,
      CALL_BUDGET_POLICY.maxRequiredReplacements,
    ],
  );
  await database.query(
    `INSERT INTO jobs(job_id, run_id, snapshot_id, kind, logical_key,
      input_hash, status, created_at) VALUES ($1, $2, $3, 'research',
      'collection:initial', $4, 'queued', $5)`,
    [
      context.ids.jobId,
      context.ids.runId,
      input.snapshotId,
      childHash,
      context.now,
    ],
  );
  await database.query(
    `INSERT INTO run_events(run_id, sequence, event_id, event_type,
      state_id, occurred_at, payload_json) VALUES ($1, 1, $2, 'run_created',
      'run_created', $3, $4)`,
    [
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
    ],
  );
  await database.query(
    `INSERT INTO research_requests(run_id, principal_id, symbol,
      question, locale, request_hash, created_at, research_kind, department_id,
      research_profile_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
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
    ],
  );
  await database.query(
    `INSERT INTO research_question_localizations(
      run_id, locale, question, created_at
    ) VALUES ($1, $2, $3, $4)
    ON CONFLICT(run_id, locale) DO NOTHING`,
    [context.ids.runId, parent.locale, input.question, context.now],
  );
  await database.query(
    `INSERT INTO run_lineage(child_run_id, parent_run_id, kind,
      effective_snapshot_id, prior_report_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      context.ids.runId,
      parent.run_id,
      input.lineage,
      input.snapshotId,
      input.priorReportId,
      context.now,
    ],
  );
}

export { parentRow };

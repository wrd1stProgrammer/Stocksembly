import type Database from "better-sqlite3";
import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../../domain/callBudgetContracts";
import { serializeSafeJson } from "../persistence/sqlite/safeJson";
import {
  type ChildRun,
  ChildRunSchema,
  type CommandIds,
  type CommandResult,
} from "./researchCommandContracts";
import {
  commandDigest,
  commitCommand,
  replayCommand,
} from "./researchCommandIdempotency";

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
});

type CommandContext = {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly now: string;
  readonly ids: CommandIds;
};

function parentRow(
  database: Database.Database,
  principalId: string,
  runId: string,
): z.infer<typeof ParentRowSchema> | undefined {
  const value = database
    .prepare(`SELECT runs.run_id, runs.snapshot_id, runs.status, runs.version,
      runs.report_id, research_requests.symbol, research_requests.question,
      research_requests.locale, research_requests.request_hash
      FROM runs JOIN research_requests USING(run_id)
      WHERE runs.run_id = ? AND research_requests.principal_id = ?`)
    .get(runId, principalId);
  return value === undefined ? undefined : ParentRowSchema.parse(value);
}

export function retryResearchRun(
  database: Database.Database,
  parentRunId: string,
  context: CommandContext,
): CommandResult<ChildRun> {
  return database
    .transaction((): CommandResult<ChildRun> => {
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
        return { kind: "replayed", value: ChildRunSchema.parse(replay.value) };
      const parent = parentRow(database, context.principalId, parentRunId);
      if (parent === undefined) return { kind: "not_found" };
      if (parent.status !== "failed" && parent.status !== "incomplete")
        return { kind: "illegal_state" };
      const rightsFailure = database
        .prepare(`SELECT 1 FROM run_public_limitations
        WHERE run_id = ? AND code = 'rights_failure'`)
        .get(parentRunId);
      if (rightsFailure !== undefined) return { kind: "illegal_state" };
      insertChild(database, parent, context, {
        snapshotId: parent.snapshot_id,
        lineage: "same-snapshot-retry",
        priorReportId: null,
        question: parent.question,
      });
      const value = ChildRunSchema.parse({
        runId: context.ids.runId,
        snapshotId: parent.snapshot_id,
        status: "queued",
        parentRunId,
        lineage: "same-snapshot-retry",
      });
      commitCommand(database, {
        scope,
        key: context.idempotencyKey,
        requestHash,
        value: {
          runId: value.runId,
          snapshotId: value.snapshotId,
          status: value.status,
          parentRunId: value.parentRunId,
          lineage: value.lineage,
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
      question, locale, request_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(
      context.ids.runId,
      context.principalId,
      parent.symbol,
      input.question,
      parent.locale,
      childHash,
      context.now,
    );
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

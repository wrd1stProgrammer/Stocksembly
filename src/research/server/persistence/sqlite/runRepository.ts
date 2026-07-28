import type Database from "better-sqlite3";
import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../../../domain/callBudgetContracts";
import {
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  ReportIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { JobStatusSchema } from "../../../domain/jobStateContracts";
import { RunStatusSchema } from "../../../domain/runStateContracts";
import { StateConflictError } from "./errors";
import { parseSafeJson, serializeSafeJson } from "./safeJson";
import type {
  AppendRunEventInput,
  CreateChildRunInput,
  CreateRunInput,
  JobSeed,
  SqliteEventDraft,
  StoredEvent,
  StoredJob,
  StoredRun,
  TransitionRunInput,
} from "./types";

const RunRowSchema = z.object({
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  status: RunStatusSchema,
  last_event_seq: z.number().int().nonnegative(),
  created_at: z.string(),
  version: z.number().int().nonnegative(),
  remaining_base_calls: z.number().int().nonnegative(),
  requested_optional_calls: z.number().int().nonnegative(),
  requested_replacement_calls: z.number().int().nonnegative(),
  report_id: ReportIdSchema.nullable(),
  lineage_kind: z
    .enum(["same-snapshot-retry", "new-snapshot-follow-up"])
    .nullable(),
  parent_run_id: RunIdSchema.nullable(),
  prior_report_id: ReportIdSchema.nullable(),
});
const JobRowSchema = z.object({
  job_id: JobIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  kind: z.enum(["research", "qa"]),
  logical_key: z.string(),
  input_hash: z.string(),
  status: JobStatusSchema,
  attempt_id: AttemptIdSchema.nullable(),
  lease_owner: z.string().nullable(),
  lease_token: z.number().int().nonnegative(),
  lease_expires_at: z.string().nullable(),
});
const EventRowSchema = z.object({
  run_id: RunIdSchema,
  sequence: z.number().int().positive(),
  event_id: EventIdSchema,
  event_type: z.string(),
  state_id: z.string(),
  occurred_at: z.string(),
  payload_json: z.string(),
});
const SequenceRowSchema = z.object({
  last_event_seq: z.number().int().positive(),
});

type EventInsert = {
  readonly runId: string;
  readonly sequence: number;
  readonly event: SqliteEventDraft;
};

function insertJob(
  database: Database.Database,
  runId: string,
  snapshotId: string,
  job: JobSeed,
): void {
  database
    .prepare(`INSERT INTO jobs(
      job_id, run_id, snapshot_id, kind, logical_key, input_hash,
      input_manifest_hash, status, created_at
    ) VALUES (
      @jobId, @runId, @snapshotId, @kind, @logicalKey, @inputHash,
      @inputManifestHash, 'queued', @createdAt
    )`)
    .run({
      ...job,
      runId,
      snapshotId,
      inputManifestHash: job.inputManifestHash ?? null,
    });
}

function insertEvent(database: Database.Database, input: EventInsert): void {
  const { event } = input;
  database
    .prepare(`INSERT INTO run_events(
      run_id, sequence, event_id, event_type, state_id, job_id,
      attempt_id, occurred_at, payload_json
    ) VALUES (
      @runId, @sequence, @eventId, @eventType, @stateId, @jobId,
      @attemptId, @occurredAt, @payloadJson
    )`)
    .run({
      runId: input.runId,
      sequence: input.sequence,
      eventId: event.eventId,
      eventType: event.type,
      stateId: event.stateId,
      jobId: event.jobId ?? null,
      attemptId: event.attemptId ?? null,
      occurredAt: event.occurredAt,
      payloadJson: serializeSafeJson(event.payload ?? {}),
    });
}

export function createRun(
  database: Database.Database,
  input: CreateRunInput,
): void {
  database
    .transaction(() => {
      database
        .prepare(`INSERT INTO runs(
          run_id, snapshot_id, status, last_event_seq, created_at,
          remaining_base_calls, requested_optional_calls, requested_replacement_calls
        ) VALUES (
          @runId, @snapshotId, 'queued', 1, @requestedAt,
          @remainingBaseCalls, @requestedOptionalCalls, @requestedReplacementCalls
        )`)
        .run({
          ...input,
          remainingBaseCalls:
            input.remainingBaseCalls ??
            CALL_BUDGET_POLICY.mandatoryFirstAttempts,
          requestedOptionalCalls:
            input.requestedOptionalCalls ??
            CALL_BUDGET_POLICY.maxOptionalFollowups,
          requestedReplacementCalls:
            input.requestedReplacementCalls ??
            CALL_BUDGET_POLICY.maxRequiredReplacements,
        });
      database
        .prepare(`INSERT INTO snapshots(snapshot_id, run_id, state, requested_at)
        VALUES (@snapshotId, @runId, 'collecting', @requestedAt)`)
        .run(input);
      insertJob(database, input.runId, input.snapshotId, input.initialJob);
      insertEvent(database, {
        runId: input.runId,
        sequence: 1,
        event: input.initialEvent,
      });
    })
    .immediate();
}

export function transitionRun(
  database: Database.Database,
  input: TransitionRunInput,
): number {
  return database
    .transaction(() => {
      const row = database
        .prepare(`UPDATE runs
        SET status = @toStatus, last_event_seq = last_event_seq + 1,
          version = version + 1
        WHERE run_id = @runId AND status = @fromStatus
          AND (@expectedVersion IS NULL OR version = @expectedVersion)
        RETURNING last_event_seq`)
        .get({ ...input, expectedVersion: input.expectedVersion ?? null });
      if (row === undefined)
        throw new StateConflictError(
          input.runId,
          `expected ${input.fromStatus}`,
        );
      const sequence = SequenceRowSchema.parse(row).last_event_seq;
      const run = findRun(database, input.runId);
      if (run === undefined)
        throw new StateConflictError(
          input.runId,
          "run vanished during transition",
        );
      for (const job of input.nextJobs)
        insertJob(database, input.runId, run.snapshotId, job);
      insertEvent(database, {
        runId: input.runId,
        sequence,
        event: input.event,
      });
      return sequence;
    })
    .immediate();
}

export function appendRunEvent(
  database: Database.Database,
  input: AppendRunEventInput,
): number {
  return database
    .transaction(() => {
      const row = database
        .prepare(`UPDATE runs SET last_event_seq = last_event_seq + 1
        WHERE run_id = @runId RETURNING last_event_seq`)
        .get(input);
      if (row === undefined)
        throw new StateConflictError(input.runId, "run not found");
      const sequence = SequenceRowSchema.parse(row).last_event_seq;
      insertEvent(database, {
        runId: input.runId,
        sequence,
        event: input.event,
      });
      return sequence;
    })
    .immediate();
}

export function findRun(
  database: Database.Database,
  runId: string,
): StoredRun | undefined {
  const value = database
    .prepare(
      `SELECT runs.run_id,
        COALESCE(run_lineage.effective_snapshot_id, runs.snapshot_id) AS snapshot_id,
        runs.status, runs.last_event_seq, runs.created_at, runs.version,
        runs.remaining_base_calls, runs.requested_optional_calls,
        runs.requested_replacement_calls,
        COALESCE(runs.report_id, reports.report_id) AS report_id,
        run_lineage.kind AS lineage_kind,
        run_lineage.parent_run_id, run_lineage.prior_report_id
      FROM runs
      LEFT JOIN run_lineage ON run_lineage.child_run_id = runs.run_id
      LEFT JOIN reports ON reports.run_id = runs.run_id AND reports.state = 'published'
      WHERE runs.run_id = ?`,
    )
    .get(runId);
  if (value === undefined) return undefined;
  const row = RunRowSchema.parse(value);
  return {
    runId: row.run_id,
    snapshotId: row.snapshot_id,
    status: row.status,
    lastEventSeq: row.last_event_seq,
    createdAt: row.created_at,
    version: row.version,
    remainingBaseCalls: row.remaining_base_calls,
    requestedOptionalCalls: row.requested_optional_calls,
    requestedReplacementCalls: row.requested_replacement_calls,
    ...(row.report_id === null ? {} : { reportId: row.report_id }),
    ...(row.lineage_kind === null || row.parent_run_id === null
      ? {}
      : {
          lineage: {
            kind: row.lineage_kind,
            parentRunId: row.parent_run_id,
          },
        }),
    ...(row.prior_report_id === null
      ? {}
      : { priorReportId: row.prior_report_id }),
  };
}

export function createChildRun(
  database: Database.Database,
  input: CreateChildRunInput,
): StoredRun {
  return database
    .transaction(() => {
      const parent = findRun(database, input.parentRunId);
      if (parent === undefined)
        throw new StateConflictError(input.parentRunId, "parent run not found");
      const retry = input.kind === "same-snapshot-retry";
      if (
        (retry &&
          parent.status !== "failed" &&
          parent.status !== "incomplete") ||
        (!retry &&
          parent.status !== "completed" &&
          parent.status !== "complete-with-limitations")
      )
        throw new StateConflictError(
          input.parentRunId,
          "parent is not eligible",
        );
      const snapshotId = retry ? parent.snapshotId : input.snapshotId;
      if (
        snapshotId === undefined ||
        (!retry && snapshotId === parent.snapshotId)
      )
        throw new StateConflictError(
          input.childRunId,
          "child snapshot is invalid",
        );
      if (!retry) {
        const report = database
          .prepare(`SELECT report_id FROM reports
            WHERE report_id = ? AND run_id = ? AND state = 'published'`)
          .get(input.priorReportId, input.parentRunId);
        if (report === undefined)
          throw new StateConflictError(
            input.parentRunId,
            "published parent report required",
          );
      }
      database
        .prepare(`INSERT INTO runs(
          run_id, snapshot_id, status, last_event_seq, created_at
        ) VALUES (@childRunId, @snapshotId, 'queued', 1, @createdAt)`)
        .run({ ...input, snapshotId });
      if (!retry)
        database
          .prepare(`INSERT INTO snapshots(snapshot_id, run_id, state, requested_at)
            VALUES (@snapshotId, @childRunId, 'collecting', @createdAt)`)
          .run({ ...input, snapshotId });
      database
        .prepare(`INSERT INTO run_lineage(
          child_run_id, parent_run_id, kind, effective_snapshot_id,
          prior_report_id, created_at
        ) VALUES (
          @childRunId, @parentRunId, @kind, @snapshotId,
          @priorReportId, @createdAt
        )`)
        .run({
          ...input,
          snapshotId,
          priorReportId: input.priorReportId ?? null,
        });
      insertJob(database, input.childRunId, snapshotId, input.initialJob);
      insertEvent(database, {
        runId: input.childRunId,
        sequence: 1,
        event: input.event,
      });
      const child = findRun(database, input.childRunId);
      if (child === undefined)
        throw new StateConflictError(
          input.childRunId,
          "child run not found after insert",
        );
      return child;
    })
    .immediate();
}

export function findJob(
  database: Database.Database,
  jobId: string,
): StoredJob | undefined {
  const value = database
    .prepare("SELECT * FROM jobs WHERE job_id = ?")
    .get(jobId);
  if (value === undefined) return undefined;
  const row = JobRowSchema.parse(value);
  return {
    jobId: row.job_id,
    runId: row.run_id,
    snapshotId: row.snapshot_id,
    kind: row.kind,
    logicalKey: row.logical_key,
    inputHash: row.input_hash,
    status: row.status,
    ...(row.attempt_id === null ? {} : { attemptId: row.attempt_id }),
    ...(row.lease_owner === null ? {} : { leaseOwner: row.lease_owner }),
    leaseToken: row.lease_token,
    ...(row.lease_expires_at === null
      ? {}
      : { leaseExpiresAt: row.lease_expires_at }),
  };
}

export function eventsAfter(
  database: Database.Database,
  runId: string,
  sequence: number,
): readonly StoredEvent[] {
  const values = database
    .prepare(
      "SELECT * FROM run_events WHERE run_id = ? AND sequence > ? ORDER BY sequence",
    )
    .all(runId, sequence);
  return values.map((value) => {
    const row = EventRowSchema.parse(value);
    return {
      runId: row.run_id,
      sequence: row.sequence,
      eventId: row.event_id,
      type: row.event_type,
      stateId: row.state_id,
      occurredAt: row.occurred_at,
      payload: parseSafeJson(row.payload_json),
    };
  });
}

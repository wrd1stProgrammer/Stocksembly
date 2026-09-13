import { CALL_BUDGET_POLICY } from "../../../domain/callBudgetContracts";
import {
  EventRowSchema,
  JobRowSchema,
  RunRowSchema,
  SequenceRowSchema,
} from "../runRows";
import { type ResearchDatabase, researchTransaction } from "./database";
import { StateConflictError } from "./errors";
import { parseSafeJson, serializeSafeJson } from "./safeJson";
import type {
  AppendRunEventInput,
  CreateChildRunInput,
  CreateRunInput,
  JobSeed,
  StoredEvent,
  StoredEventDraft,
  StoredJob,
  StoredRun,
  TransitionRunInput,
} from "./types";

type EventInsert = {
  readonly runId: string;
  readonly sequence: number;
  readonly event: StoredEventDraft;
};
async function insertJob(
  database: ResearchDatabase,
  runId: string,
  snapshotId: string,
  job: JobSeed,
): Promise<void> {
  await database.query(
    `INSERT INTO research.jobs(
      job_id, run_id, snapshot_id, kind, logical_key, input_hash,
      input_manifest_hash, status, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, 'queued', $8
    )`,
    [
      job.jobId,
      runId,
      snapshotId,
      job.kind,
      job.logicalKey,
      job.inputHash,
      job.inputManifestHash ?? null,
      job.createdAt,
    ],
  );
}
async function insertEvent(
  database: ResearchDatabase,
  input: EventInsert,
): Promise<void> {
  const { event } = input;
  await database.query(
    `INSERT INTO research.run_events(
      run_id, sequence, event_id, event_type, state_id, job_id,
      attempt_id, occurred_at, payload_json
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9
    )`,
    [
      input.runId,
      input.sequence,
      event.eventId,
      event.type,
      event.stateId,
      event.jobId ?? null,
      event.attemptId ?? null,
      event.occurredAt,
      serializeSafeJson(event.payload ?? {}),
    ],
  );
}
export async function createRun(
  database: ResearchDatabase,
  input: CreateRunInput,
): Promise<void> {
  await researchTransaction(database, async (database) => {
    await database.query(
      `INSERT INTO research.runs(
          run_id, snapshot_id, status, last_event_seq, created_at,
          remaining_base_calls, requested_optional_calls, requested_replacement_calls
        ) VALUES (
          $1, $2, 'queued', 1, $3,
          $4, $5, $6
        )`,
      [
        input.runId,
        input.snapshotId,
        input.requestedAt,
        input.remainingBaseCalls ?? CALL_BUDGET_POLICY.mandatoryFirstAttempts,
        input.requestedOptionalCalls ?? CALL_BUDGET_POLICY.maxOptionalFollowups,
        input.requestedReplacementCalls ??
          CALL_BUDGET_POLICY.maxRequiredReplacements,
      ],
    );
    await database.query(
      `INSERT INTO research.snapshots(snapshot_id, run_id, state, requested_at)
        VALUES ($1, $2, 'collecting', $3)`,
      [input.snapshotId, input.runId, input.requestedAt],
    );
    await insertJob(database, input.runId, input.snapshotId, input.initialJob);
    await insertEvent(database, {
      runId: input.runId,
      sequence: 1,
      event: input.initialEvent,
    });
  });
}
export async function transitionRun(
  database: ResearchDatabase,
  input: TransitionRunInput,
): Promise<number> {
  return await researchTransaction(database, async (database) => {
    const row = (
      await database.query(
        `UPDATE research.runs
        SET status = $1, last_event_seq = last_event_seq + 1,
          version = version + 1
        WHERE run_id = $2 AND status = $3
          AND ($4::integer IS NULL OR version = $4)
        RETURNING last_event_seq`,
        [
          input.toStatus,
          input.runId,
          input.fromStatus,
          input.expectedVersion ?? null,
        ],
      )
    ).rows[0];
    if (row === undefined)
      throw new StateConflictError(input.runId, `expected ${input.fromStatus}`);
    const sequence = SequenceRowSchema.parse(row).last_event_seq;
    const run = await findRun(database, input.runId);
    if (run === undefined)
      throw new StateConflictError(
        input.runId,
        "run vanished during transition",
      );
    for (const job of input.nextJobs)
      await insertJob(database, input.runId, run.snapshotId, job);
    await insertEvent(database, {
      runId: input.runId,
      sequence,
      event: input.event,
    });
    return sequence;
  });
}
export async function appendRunEvent(
  database: ResearchDatabase,
  input: AppendRunEventInput,
): Promise<number> {
  return await researchTransaction(database, async (database) => {
    const row = (
      await database.query(
        `UPDATE research.runs SET last_event_seq = last_event_seq + 1
        WHERE run_id = $1 RETURNING last_event_seq`,
        [input.runId],
      )
    ).rows[0];
    if (row === undefined)
      throw new StateConflictError(input.runId, "run not found");
    const sequence = SequenceRowSchema.parse(row).last_event_seq;
    await insertEvent(database, {
      runId: input.runId,
      sequence,
      event: input.event,
    });
    return sequence;
  });
}
export async function findRun(
  database: ResearchDatabase,
  runId: string,
): Promise<StoredRun | undefined> {
  const value = (
    await database.query(
      `SELECT runs.run_id,
        COALESCE(run_lineage.effective_snapshot_id, runs.snapshot_id) AS snapshot_id,
        runs.status, runs.last_event_seq, runs.created_at, runs.version,
        runs.remaining_base_calls, runs.requested_optional_calls,
        runs.requested_replacement_calls,
        COALESCE(runs.report_id, reports.report_id) AS report_id,
        run_lineage.kind AS lineage_kind,
        run_lineage.parent_run_id, run_lineage.prior_report_id
      FROM research.runs
      LEFT JOIN research.run_lineage ON run_lineage.child_run_id = runs.run_id
      LEFT JOIN research.reports ON reports.run_id = runs.run_id AND reports.state = 'published'
      WHERE runs.run_id = $1`,
      [runId],
    )
  ).rows[0];
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
export async function createChildRun(
  database: ResearchDatabase,
  input: CreateChildRunInput,
): Promise<StoredRun> {
  return await researchTransaction(database, async (database) => {
    await database.query(
      "SELECT run_id FROM research.runs WHERE run_id=$1 FOR UPDATE",
      [input.parentRunId],
    );
    const parent = await findRun(database, input.parentRunId);
    if (parent === undefined)
      throw new StateConflictError(input.parentRunId, "parent run not found");
    const retry = input.kind === "same-snapshot-retry";
    if (
      (retry && parent.status !== "failed" && parent.status !== "incomplete") ||
      (!retry &&
        parent.status !== "completed" &&
        parent.status !== "complete-with-limitations")
    )
      throw new StateConflictError(input.parentRunId, "parent is not eligible");
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
      const report = (
        await database.query(
          `SELECT report_id FROM research.reports
            WHERE report_id = $1 AND run_id = $2 AND state = 'published'`,
          [input.priorReportId, input.parentRunId],
        )
      ).rows[0];
      if (report === undefined)
        throw new StateConflictError(
          input.parentRunId,
          "published parent report required",
        );
    }
    await database.query(
      `INSERT INTO research.runs(
          run_id, snapshot_id, status, last_event_seq, created_at
        ) VALUES ($1, $2, 'queued', 1, $3)`,
      [input.childRunId, snapshotId, input.createdAt],
    );
    if (!retry)
      await database.query(
        `INSERT INTO research.snapshots(snapshot_id, run_id, state, requested_at)
            VALUES ($1, $2, 'collecting', $3)`,
        [snapshotId, input.childRunId, input.createdAt],
      );
    await database.query(
      `INSERT INTO research.run_lineage(
          child_run_id, parent_run_id, kind, effective_snapshot_id,
          prior_report_id, created_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6
        )`,
      [
        input.childRunId,
        input.parentRunId,
        input.kind,
        snapshotId,
        input.priorReportId ?? null,
        input.createdAt,
      ],
    );
    await insertJob(database, input.childRunId, snapshotId, input.initialJob);
    await insertEvent(database, {
      runId: input.childRunId,
      sequence: 1,
      event: input.event,
    });
    const child = await findRun(database, input.childRunId);
    if (child === undefined)
      throw new StateConflictError(
        input.childRunId,
        "child run not found after insert",
      );
    return child;
  });
}
export async function findJob(
  database: ResearchDatabase,
  jobId: string,
): Promise<StoredJob | undefined> {
  const value = (
    await database.query(`SELECT * FROM research.jobs WHERE job_id = $1`, [
      jobId,
    ])
  ).rows[0];
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
export async function eventsAfter(
  database: ResearchDatabase,
  runId: string,
  sequence: number,
): Promise<readonly StoredEvent[]> {
  const values = (
    await database.query(
      `SELECT * FROM research.run_events WHERE run_id = $1 AND sequence > $2 ORDER BY sequence`,
      [runId, sequence],
    )
  ).rows;
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

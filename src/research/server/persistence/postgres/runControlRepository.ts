import { z } from "zod";
import { AttemptIdSchema } from "../../../domain/ids";
import {
  RUN_TERMINAL_STATUSES,
  type RunStatus,
} from "../../../domain/runStateContracts";
import {
  type CancellationEventKind,
  cancellationPublicEvent,
} from "./cancellationPublicEvent";
import { type ResearchDatabase, researchTransaction } from "./database";
import { StateConflictError } from "./errors";
import { findRun } from "./runRepository";
import type {
  FinalizeRunCancellationInput,
  RequestRunCancellationInput,
  RunCancellationRequest,
} from "./types";

const SequenceRowSchema = z.object({
  last_event_seq: z.number().int().positive(),
});
const terminalStatuses: ReadonlySet<RunStatus> = new Set(RUN_TERMINAL_STATUSES);
type CancellationStateCommit = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly expectedVersion: number;
  readonly eventId: string;
  readonly eventType: CancellationEventKind;
  readonly occurredAt: string;
};
async function commitCancellationState(
  database: ResearchDatabase,
  input: CancellationStateCommit,
): Promise<void> {
  const updated = (
    await database.query(
      `UPDATE research.runs
      SET status = $1, last_event_seq = last_event_seq + 1,
        version = version + 1
      WHERE run_id = $2 AND status = $3
        AND version = $4
      RETURNING last_event_seq`,
      [input.toStatus, input.runId, input.fromStatus, input.expectedVersion],
    )
  ).rows[0];
  if (updated === undefined)
    throw new StateConflictError(
      input.runId,
      `expected ${input.fromStatus} at version ${input.expectedVersion}`,
    );
  const sequence = SequenceRowSchema.parse(updated).last_event_seq;
  const event = cancellationPublicEvent({
    eventId: input.eventId,
    runId: input.runId,
    snapshotId: input.snapshotId,
    sequence,
    kind: input.eventType,
    occurredAt: input.occurredAt,
  });
  await database.query(
    `INSERT INTO research.run_events(
      run_id, sequence, event_id, event_type, state_id, occurred_at, payload_json
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7
    )`,
    [
      event.runId,
      event.sequence,
      event.eventId,
      event.kind,
      event.stateId,
      event.occurredAt,
      event.payloadJson,
    ],
  );
}
export async function requestRunCancellation(
  database: ResearchDatabase,
  input: RequestRunCancellationInput,
): Promise<RunCancellationRequest> {
  return await researchTransaction(database, async (database) => {
    await database.query(
      "SELECT run_id FROM research.runs WHERE run_id=$1 FOR UPDATE",
      [input.runId],
    );
    const run = await findRun(database, input.runId);
    if (run === undefined)
      throw new StateConflictError(input.runId, "run not found");
    if (terminalStatuses.has(run.status))
      return { kind: "terminal_immutable", status: run.status } as const;
    const activeAttemptIds = (
      await database.query(
        `SELECT attempt_id
          FROM research.attempts WHERE run_id = $1 AND status IN ('spawn-reserved', 'running')
          ORDER BY created_at, attempt_id`,
        [input.runId],
      )
    ).rows.map((row) => AttemptIdSchema.parse(row.attempt_id));
    const hasActive = activeAttemptIds.length > 0;
    await commitCancellationState(database, {
      runId: input.runId,
      snapshotId: run.snapshotId,
      fromStatus: run.status,
      toStatus: "cancelling",
      expectedVersion: run.version,
      eventId: input.eventId,
      eventType: "run_cancelling",
      occurredAt: input.now,
    });
    if (!hasActive)
      await commitCancellationState(database, {
        runId: input.runId,
        snapshotId: run.snapshotId,
        fromStatus: "cancelling",
        toStatus: "cancelled",
        expectedVersion: run.version + 1,
        eventId: input.terminalEventId,
        eventType: "run_cancelled",
        occurredAt: input.now,
      });
    await database.query(
      `UPDATE research.jobs SET status = 'cancelled',
          lease_owner = NULL, lease_expires_at = NULL, result_artifact_id = NULL
          WHERE run_id = $1 AND status IN ('queued', 'leased', 'retry-wait')`,
      [input.runId],
    );
    if (hasActive)
      await database.query(
        `UPDATE research.jobs SET status = 'cancel-requested'
            WHERE run_id = $1 AND status IN (
              'leased', 'spawn-reserved', 'running', 'cancel-requested'
            )`,
        [input.runId],
      );
    const updated = await findRun(database, input.runId);
    if (updated === undefined)
      throw new StateConflictError(
        input.runId,
        "run vanished during cancellation",
      );
    return {
      kind: "requested",
      version: updated.version,
      activeAttemptIds,
    } as const;
  });
}
export async function finalizeRunCancellation(
  database: ResearchDatabase,
  input: FinalizeRunCancellationInput,
): Promise<boolean> {
  return await researchTransaction(database, async (database) => {
    await database.query(
      "SELECT run_id FROM research.runs WHERE run_id=$1 FOR UPDATE",
      [input.runId],
    );
    const run = await findRun(database, input.runId);
    if (run?.status === "cancelled") return true;
    if (
      run === undefined ||
      run.status !== "cancelling" ||
      run.version !== input.expectedVersion
    )
      return false;
    await commitCancellationState(database, {
      runId: input.runId,
      snapshotId: run.snapshotId,
      fromStatus: "cancelling",
      toStatus: "cancelled",
      expectedVersion: input.expectedVersion,
      eventId: input.eventId,
      eventType: "run_cancelled",
      occurredAt: input.now,
    });
    await database.query(
      `UPDATE research.attempts SET status = 'cancelled', outcome = 'cancelled'
          WHERE run_id = $1 AND status IN ('spawn-reserved', 'running')`,
      [input.runId],
    );
    await database.query(
      `UPDATE research.jobs SET status = 'cancelled', lease_owner = NULL,
          lease_expires_at = NULL, result_artifact_id = NULL
          WHERE run_id = $1 AND status = 'cancel-requested'`,
      [input.runId],
    );
    return true;
  });
}

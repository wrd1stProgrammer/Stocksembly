import type Database from "better-sqlite3";
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

function commitCancellationState(
  database: Database.Database,
  input: CancellationStateCommit,
): void {
  const updated = database
    .prepare(`UPDATE runs
      SET status = @toStatus, last_event_seq = last_event_seq + 1,
        version = version + 1
      WHERE run_id = @runId AND status = @fromStatus
        AND version = @expectedVersion
      RETURNING last_event_seq`)
    .get(input);
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
  database
    .prepare(`INSERT INTO run_events(
      run_id, sequence, event_id, event_type, state_id, occurred_at, payload_json
    ) VALUES (
      @runId, @sequence, @eventId, @kind, @stateId, @occurredAt, @payloadJson
    )`)
    .run(event);
}

export function requestRunCancellation(
  database: Database.Database,
  input: RequestRunCancellationInput,
): RunCancellationRequest {
  return database
    .transaction(() => {
      const run = findRun(database, input.runId);
      if (run === undefined)
        throw new StateConflictError(input.runId, "run not found");
      if (terminalStatuses.has(run.status))
        return { kind: "terminal_immutable", status: run.status } as const;
      const activeAttemptIds = database
        .prepare<[string], { readonly attempt_id: string }>(`SELECT attempt_id
          FROM attempts WHERE run_id = ? AND status IN ('spawn-reserved', 'running')
          ORDER BY created_at, attempt_id`)
        .all(input.runId)
        .map((row) => AttemptIdSchema.parse(row.attempt_id));
      const hasActive = activeAttemptIds.length > 0;
      commitCancellationState(database, {
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
        commitCancellationState(database, {
          runId: input.runId,
          snapshotId: run.snapshotId,
          fromStatus: "cancelling",
          toStatus: "cancelled",
          expectedVersion: run.version + 1,
          eventId: input.terminalEventId,
          eventType: "run_cancelled",
          occurredAt: input.now,
        });
      database
        .prepare(`UPDATE jobs SET status = 'cancelled',
          lease_owner = NULL, lease_expires_at = NULL, result_artifact_id = NULL
          WHERE run_id = ? AND status IN ('queued', 'leased', 'retry-wait')`)
        .run(input.runId);
      if (hasActive)
        database
          .prepare(`UPDATE jobs SET status = 'cancel-requested'
            WHERE run_id = ? AND status IN (
              'leased', 'spawn-reserved', 'running', 'cancel-requested'
            )`)
          .run(input.runId);
      const updated = findRun(database, input.runId);
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
    })
    .immediate();
}

export function finalizeRunCancellation(
  database: Database.Database,
  input: FinalizeRunCancellationInput,
): boolean {
  return database
    .transaction(() => {
      const run = findRun(database, input.runId);
      if (run?.status === "cancelled") return true;
      if (
        run === undefined ||
        run.status !== "cancelling" ||
        run.version !== input.expectedVersion
      )
        return false;
      commitCancellationState(database, {
        runId: input.runId,
        snapshotId: run.snapshotId,
        fromStatus: "cancelling",
        toStatus: "cancelled",
        expectedVersion: input.expectedVersion,
        eventId: input.eventId,
        eventType: "run_cancelled",
        occurredAt: input.now,
      });
      database
        .prepare(`UPDATE attempts SET status = 'cancelled', outcome = 'cancelled'
          WHERE run_id = ? AND status IN ('spawn-reserved', 'running')`)
        .run(input.runId);
      database
        .prepare(`UPDATE jobs SET status = 'cancelled', lease_owner = NULL,
          lease_expires_at = NULL, result_artifact_id = NULL
          WHERE run_id = ? AND status = 'cancel-requested'`)
        .run(input.runId);
      return true;
    })
    .immediate();
}

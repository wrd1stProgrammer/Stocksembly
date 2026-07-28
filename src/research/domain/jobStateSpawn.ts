import {
  appendPublicEvent,
  EventLedgerSchema,
  eventIdForSequence,
} from "./eventState";
import { AttemptIdSchema } from "./ids";
import {
  AttemptSchema,
  JOB_STATUS,
  type JobRecord,
  type JobRecordData,
  JobRecordSchema,
  type ReserveSpawnContext,
  type ReserveSpawnResult,
  type SpawnReservationEvent,
  TimestampSchema,
} from "./jobStateContracts";
import {
  LaunchEntrySchema,
  type LaunchLedger,
  LaunchLedgerSchema,
} from "./jobStateLedger";
import { withJobMethods } from "./jobStateMethods";
import { isLeaseCurrent } from "./jobStateTransitions";

function plainJobData(state: JobRecord): JobRecordData {
  const { retry, ...plain } = state;
  void retry;
  return plain;
}
export function reserveSpawnOrdinal(
  state: JobRecord,
  ledger: LaunchLedger,
  context: ReserveSpawnContext,
): ReserveSpawnResult {
  const parsedState = JobRecordSchema.safeParse(plainJobData(state));
  if (!parsedState.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsedState.error.message },
    };
  const parsedLedger = LaunchLedgerSchema.safeParse(ledger);
  if (!parsedLedger.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsedLedger.error.message },
    };
  const durableLedger = parsedLedger.data;
  const parsedEventLedger = EventLedgerSchema.safeParse(context.eventLedger);
  if (!parsedEventLedger.success)
    return {
      ok: false,
      error: {
        kind: "invalid_state",
        message: parsedEventLedger.error.message,
      },
    };
  if (parsedEventLedger.data.runId !== state.runId)
    return {
      ok: false,
      error: {
        kind: "invalid_state",
        message: "event ledger run does not match job",
      },
    };
  const parsedAttemptId = AttemptIdSchema.safeParse(context.attemptId);
  const parsedNow = TimestampSchema.safeParse(context.now);
  if (!parsedAttemptId.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsedAttemptId.error.message },
    };
  if (!parsedNow.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsedNow.error.message },
    };
  if (state.status !== JOB_STATUS.leased)
    return {
      ok: false,
      error: {
        kind: "illegal_transition",
        from: state.status,
        to: JOB_STATUS.spawnReserved,
      },
    };
  if (state.kind !== durableLedger.kind)
    return {
      ok: false,
      error: {
        kind: "invalid_state",
        message: "launch ledger kind does not match job",
      },
    };
  if (!isLeaseCurrent(state.lease, context.lease, context.now))
    return { ok: false, error: { kind: "stale_lease" } };
  if (
    state.attemptId !== undefined ||
    durableLedger.entries.some(
      (entry) =>
        (entry.jobId === state.jobId ||
          entry.attemptId === context.attemptId) &&
        entry.state === "burned",
    )
  )
    return { ok: false, error: { kind: "duplicate_attempt" } };
  const ordinal = durableLedger.nextOrdinal;
  const attempt = AttemptSchema.parse({
    id: parsedAttemptId.data,
    jobId: state.jobId,
    runId: state.runId,
    snapshotId: state.snapshotId,
    kind: state.kind,
    status: JOB_STATUS.spawnReserved,
    ordinal,
    ordinalKind: state.kind,
    ordinalState: "burned",
    immutable: true,
    createdAt: parsedNow.data,
  });
  const entry = LaunchEntrySchema.parse({
    ordinal,
    kind: state.kind,
    runId: state.runId,
    jobId: state.jobId,
    attemptId: attempt.id,
    reservedAt: parsedNow.data,
    state: "burned",
  });
  const nextLedger = Object.freeze({
    kind: durableLedger.kind,
    nextOrdinal: ordinal + 1,
    entries: Object.freeze([...durableLedger.entries, Object.freeze(entry)]),
  });
  const nextJob = withJobMethods(
    JobRecordSchema.parse({
      ...plainJobData(state),
      status: JOB_STATUS.spawnReserved,
      attemptId: attempt.id,
    }),
  );
  const appendedEvent = appendPublicEvent(parsedEventLedger.data, {
    id: eventIdForSequence(state.runId, parsedEventLedger.data.nextSequence),
    runId: state.runId,
    type: "spawn_reserved",
    stateId: "spawn-reserved",
    createdAt: parsedNow.data,
    jobId: state.jobId,
    attemptId: attempt.id,
    ordinal,
  });
  if (!appendedEvent.ok)
    return {
      ok: false,
      error: { kind: "invalid_state", message: appendedEvent.error.kind },
    };
  const event: SpawnReservationEvent = appendedEvent.event;
  const eventLedger = appendedEvent.ledger;
  const nextJobs = Object.freeze([nextJob]);
  return {
    ok: true,
    job: nextJob,
    attempt: Object.freeze(attempt),
    ledger: nextLedger,
    eventLedger,
    event,
    transaction: Object.freeze({
      committed: true,
      job: nextJob,
      attempt: Object.freeze(attempt),
      ordinal,
      ledger: nextLedger,
      eventLedger,
      event,
      nextJobs,
    }),
  };
}

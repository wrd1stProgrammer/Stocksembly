import {
  appendPublicEvent,
  EventLedgerSchema,
  eventIdForSequence,
} from "./eventState";
import { ReportIdSchema, RunIdSchema } from "./ids";
import {
  type ChildRunResult,
  type CreateRunInput,
  ReportPublicationSchema,
  RUN_STATUS,
  RUN_TERMINAL_STATUSES,
  RUN_TRANSITIONS,
  type RunPublicEvent,
  type RunRecord,
  type RunRecordData,
  RunRecordSchema,
  type RunStatus,
  type RunTransitionContext,
  type RunTransitionResult,
  TimestampSchema,
} from "./runStateContracts";
import { RunNextJobSchema, runEventTypeFor } from "./runStateEvents";
import {
  type CreateChildRunInput,
  createChildRunData,
} from "./runStateLineage";

const terminalStatuses = new Set<RunStatus>(RUN_TERMINAL_STATUSES);
export function isTerminalRunStatus(status: RunStatus): boolean {
  return terminalStatuses.has(status);
}
export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  const allowed: readonly RunStatus[] = RUN_TRANSITIONS[from];
  return allowed.includes(to);
}
function immutableRecord(data: RunRecordData | RunRecord): RunRecord {
  if ("child" in data) {
    const { child, ...plain } = data;
    void child;
    return immutableRecord(plain);
  }
  const state = Object.freeze({ ...data });
  return Object.freeze({
    ...state,
    child: (input: CreateChildRunInput): ChildRunResult =>
      createChildRun(state, input),
  });
}
export function createRunRecord(input: CreateRunInput): RunRecord {
  return immutableRecord(
    RunRecordSchema.parse({
      runId: RunIdSchema.parse(input.runId),
      snapshotId: input.snapshotId,
      status: RUN_STATUS.queued,
      createdAt: input.createdAt,
      eventSeq: 0,
    }),
  );
}
export function transitionRun(
  state: RunRecord,
  to: RunStatus,
  context: RunTransitionContext,
): RunTransitionResult {
  const parsed = RunRecordSchema.safeParse(plainRunData(state));
  if (!parsed.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsed.error.message },
    };
  const parsedNow = TimestampSchema.safeParse(context.now);
  if (!parsedNow.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsedNow.error.message },
    };
  const parsedEventLedger = EventLedgerSchema.safeParse(context.eventLedger);
  if (!parsedEventLedger.success)
    return {
      ok: false,
      error: {
        kind: "invalid_state",
        message: parsedEventLedger.error.message,
      },
    };
  const durableEventLedger = parsedEventLedger.data;
  if (durableEventLedger.runId !== state.runId)
    return {
      ok: false,
      error: {
        kind: "invalid_state",
        message: "event ledger run does not match run state",
      },
    };
  if (state.eventSeq > durableEventLedger.nextSequence - 1)
    return {
      ok: false,
      error: {
        kind: "invalid_state",
        message: "event ledger is behind the run state sequence",
      },
    };
  const parsedNextJobs = (context.nextJobs ?? []).map((nextJob) =>
    RunNextJobSchema.safeParse(nextJob),
  );
  const invalidNextJob = parsedNextJobs.find((nextJob) => !nextJob.success);
  if (invalidNextJob !== undefined && !invalidNextJob.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: invalidNextJob.error.message },
    };
  if (isTerminalRunStatus(state.status))
    return {
      ok: false,
      error: { kind: "terminal_immutable", status: state.status },
    };
  if (!canTransitionRun(state.status, to))
    return {
      ok: false,
      error: { kind: "illegal_transition", from: state.status, to },
    };
  const publication = context.reportPublication ?? context.report;
  if (
    publication !== undefined &&
    to !== RUN_STATUS.completed &&
    to !== RUN_STATUS.completeWithLimitations
  )
    return {
      ok: false,
      error: {
        kind: "invalid_report",
        message:
          "reports may only be published by a terminal completion transition",
      },
    };
  const parsedPublication =
    publication === undefined
      ? undefined
      : ReportPublicationSchema.safeParse(publication);
  if (
    to === RUN_STATUS.completed ||
    to === RUN_STATUS.completeWithLimitations
  ) {
    if (publication === undefined)
      return { ok: false, error: { kind: "report_required" } };
    if (parsedPublication === undefined)
      return { ok: false, error: { kind: "report_required" } };
    if (!parsedPublication.success)
      return {
        ok: false,
        error: {
          kind: "invalid_report",
          message: parsedPublication.error.message,
        },
      };
    if (
      Date.parse(parsedPublication.data.publishedAt) > Date.parse(context.now)
    )
      return {
        ok: false,
        error: {
          kind: "invalid_report",
          message: "report publication is in the future",
        },
      };
  }
  const reportData =
    publication === undefined
      ? {}
      : {
          reportId: ReportIdSchema.parse(publication.reportId),
          reportPublishedAt: TimestampSchema.parse(publication.publishedAt),
        };
  const appendedEvent = appendPublicEvent(durableEventLedger, {
    id: eventIdForSequence(state.runId, durableEventLedger.nextSequence),
    runId: state.runId,
    type: runEventTypeFor(to),
    stateId: to,
    createdAt: TimestampSchema.parse(context.now),
    ...(publication === undefined
      ? {}
      : { reportId: ReportIdSchema.parse(publication.reportId) }),
  });
  if (!appendedEvent.ok)
    return {
      ok: false,
      error: { kind: "invalid_state", message: appendedEvent.error.kind },
    };
  const event: RunPublicEvent = Object.freeze({
    id: appendedEvent.event.id,
    runId: appendedEvent.event.runId,
    sequence: appendedEvent.event.sequence,
    type: runEventTypeFor(to),
    stateId: to,
    createdAt: appendedEvent.event.createdAt,
    ...(appendedEvent.event.reportId === undefined
      ? {}
      : { reportId: appendedEvent.event.reportId }),
  });
  const eventLedger = appendedEvent.ledger;
  const nextState = immutableRecord({
    ...plainRunData(state),
    status: to,
    eventSeq: event.sequence,
    ...reportData,
  });
  const nextJobs = Object.freeze(
    parsedNextJobs.flatMap((nextJob) =>
      nextJob.success ? [nextJob.data] : [],
    ),
  );
  const transaction = Object.freeze({
    committed: true as const,
    state: nextState,
    eventLedger,
    nextJobs,
    event,
  });
  return {
    ok: true,
    state: nextState,
    eventLedger,
    transaction,
    nextJobs,
    event,
  };
}
function plainRunData(state: RunRecord): RunRecordData {
  const { child, ...plain } = state;
  void child;
  return plain;
}
function createChildRun(
  parent: RunRecordData,
  input: CreateChildRunInput,
): ChildRunResult {
  const child = createChildRunData(parent, input);
  if (!child.ok) return { ok: false, error: child.error };
  return { ok: true, state: immutableRecord(child.data) };
}
export const createChildRunLineage = createChildRun;

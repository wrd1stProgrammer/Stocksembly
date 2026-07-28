import {
  type AttemptRecord,
  AttemptSchema,
  JOB_STATUS,
  type JobError,
  type JobRecord,
  type JobRecordData,
  JobRecordSchema,
} from "./jobStateContracts";
import { type LaunchLedger, LaunchLedgerSchema } from "./jobStateLedger";
import { withJobMethods } from "./jobStateMethods";

function plainJobData(state: JobRecord): JobRecordData {
  const { retry, ...plain } = state;
  void retry;
  return plain;
}

export function uncertainSpawnRecovery(
  state: JobRecord,
  attempt: AttemptRecord,
  ledger: LaunchLedger,
):
  | {
      readonly ok: true;
      readonly job: JobRecord;
      readonly attempt: AttemptRecord;
      readonly canRelaunchSameAttempt: false;
      readonly replacementRequired: true;
      readonly outcome: "unknown";
    }
  | { readonly ok: false; readonly error: JobError } {
  const parsedState = JobRecordSchema.safeParse(plainJobData(state));
  const parsedAttempt = AttemptSchema.safeParse(attempt);
  const parsedLedger = LaunchLedgerSchema.safeParse(ledger);
  if (!parsedState.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsedState.error.message },
    };
  if (!parsedAttempt.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsedAttempt.error.message },
    };
  if (!parsedLedger.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsedLedger.error.message },
    };
  const entry = parsedLedger.data.entries.find(
    (candidate) => candidate.attemptId === parsedAttempt.data.id,
  );
  if (
    parsedState.data.status !== JOB_STATUS.spawnReserved ||
    parsedState.data.attemptId !== parsedAttempt.data.id ||
    parsedAttempt.data.ordinalState !== "burned" ||
    parsedAttempt.data.status !== JOB_STATUS.spawnReserved ||
    parsedAttempt.data.jobId !== parsedState.data.jobId ||
    parsedAttempt.data.runId !== parsedState.data.runId ||
    parsedAttempt.data.snapshotId !== parsedState.data.snapshotId ||
    parsedAttempt.data.kind !== parsedState.data.kind ||
    parsedAttempt.data.ordinalKind !== parsedState.data.kind ||
    entry === undefined ||
    entry.state !== "burned" ||
    entry.ordinal !== parsedAttempt.data.ordinal ||
    entry.attemptId !== parsedAttempt.data.id ||
    entry.jobId !== parsedState.data.jobId ||
    entry.runId !== parsedState.data.runId ||
    entry.kind !== parsedState.data.kind
  )
    return {
      ok: false,
      error: {
        kind: "invalid_state",
        message: "uncertain recovery requires the reserved attempt",
      },
    };
  const recoveredJob = withJobMethods(
    JobRecordSchema.parse({
      ...parsedState.data,
      status: JOB_STATUS.retryWait,
    }),
  );
  return {
    ok: true,
    job: recoveredJob,
    attempt,
    canRelaunchSameAttempt: false,
    replacementRequired: true,
    outcome: "unknown",
  };
}

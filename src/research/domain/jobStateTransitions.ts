import {
  ArtifactIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "./ids";
import {
  type CreateJobInput,
  JOB_LEASE_BOUND_STATUSES,
  JOB_STATUS,
  JOB_TRANSITIONS,
  type JobError,
  type JobRecord,
  type JobRecordData,
  JobRecordSchema,
  type JobStatus,
  type JobTransitionContext,
  type JobTransitionResult,
  type Lease,
  LeaseSchema,
  TimestampSchema,
} from "./jobStateContracts";
import { withJobMethods } from "./jobStateMethods";

const terminalStatuses = new Set<JobStatus>([
  JOB_STATUS.cancelled,
  JOB_STATUS.succeeded,
  JOB_STATUS.failed,
]);
const leaseBoundStatuses = new Set<JobStatus>(JOB_LEASE_BOUND_STATUSES);
const renewableStatuses = new Set<JobStatus>([
  JOB_STATUS.leased,
  JOB_STATUS.spawnReserved,
  JOB_STATUS.running,
]);
export function createLease(input: {
  readonly owner: string;
  readonly token: number;
  readonly expiresAt: string;
}): Lease {
  return Object.freeze(LeaseSchema.parse(input));
}
export function isLeaseCurrent(
  expected: Lease | undefined,
  proof: Pick<Lease, "owner" | "token"> | undefined,
  now: string,
): boolean {
  return (
    expected !== undefined &&
    proof !== undefined &&
    expected.owner === proof.owner &&
    expected.token === proof.token &&
    Date.parse(expected.expiresAt) > Date.parse(now)
  );
}
export type LeaseRenewalContext = {
  readonly owner: string;
  readonly token: number;
  readonly now: string;
  readonly expiresAt: string;
};
export function renewLease(
  state: JobRecord,
  context: LeaseRenewalContext,
): JobTransitionResult {
  const parsed = JobRecordSchema.safeParse(plainJobData(state));
  if (!parsed.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsed.error.message },
    };
  const parsedNow = TimestampSchema.safeParse(context.now);
  if (!parsedNow.success)
    return {
      ok: false,
      error: { kind: "invalid_lease", message: parsedNow.error.message },
    };
  if (!renewableStatuses.has(state.status))
    return {
      ok: false,
      error: {
        kind: "illegal_transition",
        from: state.status,
        to: state.status,
      },
    };
  if (state.lease === undefined)
    return { ok: false, error: { kind: "lease_required" } };
  const proof = LeaseSchema.safeParse({
    owner: context.owner,
    token: context.token,
    expiresAt: context.expiresAt,
  });
  if (!proof.success)
    return {
      ok: false,
      error: {
        kind: "invalid_lease",
        message: proof.error.message,
      },
    };
  if (
    state.lease.owner !== proof.data.owner ||
    state.lease.token !== proof.data.token
  )
    return { ok: false, error: { kind: "stale_lease" } };
  if (Date.parse(state.lease.expiresAt) <= Date.parse(parsedNow.data))
    return { ok: false, error: { kind: "expired_lease" } };
  if (Date.parse(proof.data.expiresAt) <= Date.parse(state.lease.expiresAt))
    return {
      ok: false,
      error: { kind: "invalid_lease", message: "lease expiry must increase" },
    };
  const renewed = withJobMethods(
    JobRecordSchema.parse({ ...plainJobData(state), lease: proof.data }),
  );
  return { ok: true, state: renewed };
}
export function isTerminalJobStatus(status: JobStatus): boolean {
  return terminalStatuses.has(status);
}
export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  const allowed: readonly JobStatus[] = JOB_TRANSITIONS[from];
  return allowed.includes(to);
}
export function createJobRecord(input: CreateJobInput): JobRecord {
  return withJobMethods(
    JobRecordSchema.parse({
      jobId: JobIdSchema.parse(input.jobId),
      runId: RunIdSchema.parse(input.runId),
      snapshotId: SnapshotIdSchema.parse(input.snapshotId),
      kind: input.kind,
      logicalKey: input.logicalKey,
      status: JOB_STATUS.queued,
      createdAt: input.createdAt,
    }),
  );
}
function leaseError(
  state: JobRecord,
  context: JobTransitionContext,
): JobError | undefined {
  if (state.status === JOB_STATUS.queued && context.lease !== undefined)
    return Date.parse(context.lease.expiresAt) <= Date.parse(context.now)
      ? { kind: "expired_lease" }
      : undefined;
  if (!leaseBoundStatuses.has(state.status) || state.lease === undefined)
    return undefined;
  if (context.leaseOwner === undefined || context.leaseToken === undefined)
    return { kind: "lease_required" };
  if (
    state.lease?.owner !== context.leaseOwner ||
    state.lease.token !== context.leaseToken
  )
    return { kind: "stale_lease" };
  return Date.parse(state.lease.expiresAt) <= Date.parse(context.now)
    ? { kind: "expired_lease" }
    : undefined;
}
export function transitionJob(
  state: JobRecord,
  to: JobStatus,
  context: JobTransitionContext,
): JobTransitionResult {
  const parsed = JobRecordSchema.safeParse(plainJobData(state));
  if (!parsed.success)
    return {
      ok: false,
      error: { kind: "invalid_state", message: parsed.error.message },
    };
  const parsedNow = TimestampSchema.safeParse(context.now);
  if (!parsedNow.success)
    return {
      ok: false,
      error: { kind: "invalid_lease", message: parsedNow.error.message },
    };
  if (
    context.lease !== undefined &&
    !LeaseSchema.safeParse(context.lease).success
  )
    return {
      ok: false,
      error: { kind: "invalid_lease", message: "lease proof is malformed" },
    };
  if (isTerminalJobStatus(state.status))
    return {
      ok: false,
      error: { kind: "terminal_immutable", status: state.status },
    };
  if (!canTransitionJob(state.status, to))
    return {
      ok: false,
      error: { kind: "illegal_transition", from: state.status, to },
    };
  if (state.status === JOB_STATUS.leased && to === JOB_STATUS.leased) {
    if (context.lease === undefined)
      return { ok: false, error: { kind: "lease_required" } };
    return renewLease(state, {
      owner: context.lease.owner,
      token: context.lease.token,
      now: context.now,
      expiresAt: context.lease.expiresAt,
    });
  }
  const leaseFailure = leaseError(state, context);
  if (leaseFailure !== undefined) return { ok: false, error: leaseFailure };
  if (to === JOB_STATUS.leased && context.lease === undefined)
    return { ok: false, error: { kind: "lease_required" } };
  if (to === JOB_STATUS.succeeded && context.resultArtifactId === undefined)
    return { ok: false, error: { kind: "artifact_required" } };
  const source = plainJobData(state);
  const nextSource =
    to === JOB_STATUS.queued
      ? (() => {
          const { attemptId, lease, resultArtifactId, ...queued } = source;
          void attemptId;
          void lease;
          void resultArtifactId;
          return queued;
        })()
      : source;
  return {
    ok: true,
    state: withJobMethods(
      JobRecordSchema.parse({
        ...nextSource,
        status: to,
        ...(to === JOB_STATUS.leased ? { lease: context.lease } : {}),
        ...(context.resultArtifactId === undefined
          ? {}
          : {
              resultArtifactId: ArtifactIdSchema.parse(
                context.resultArtifactId,
              ),
            }),
      }),
    ),
  };
}
function plainJobData(state: JobRecord): JobRecordData {
  const { retry, ...plain } = state;
  void retry;
  return plain;
}

import { z } from "zod";
import type { EventLedger } from "./eventStateLedger";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "./ids";
import type { SpawnReservationEvent } from "./jobStateEvents";
import type { LaunchLedger } from "./jobStateLedger";

export type { SpawnReservationEvent } from "./jobStateEvents";

import type { AttemptRecord } from "./jobStateAttempt";

export type { AttemptRecord } from "./jobStateAttempt";
export { AttemptSchema } from "./jobStateAttempt";

export const JOB_STATUS = {
  queued: "queued",
  leased: "leased",
  spawnReserved: "spawn-reserved",
  running: "running",
  retryWait: "retry-wait",
  cancelRequested: "cancel-requested",
  cancelled: "cancelled",
  succeeded: "succeeded",
  failed: "failed",
} as const;
export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export const JobStatusSchema = z.enum([
  JOB_STATUS.queued,
  JOB_STATUS.leased,
  JOB_STATUS.spawnReserved,
  JOB_STATUS.running,
  JOB_STATUS.retryWait,
  JOB_STATUS.cancelRequested,
  JOB_STATUS.cancelled,
  JOB_STATUS.succeeded,
  JOB_STATUS.failed,
]);
export const JOB_TRANSITIONS = {
  queued: [
    JOB_STATUS.leased,
    JOB_STATUS.cancelRequested,
    JOB_STATUS.cancelled,
    JOB_STATUS.failed,
  ],
  leased: [
    JOB_STATUS.leased,
    JOB_STATUS.spawnReserved,
    JOB_STATUS.queued,
    JOB_STATUS.cancelRequested,
    JOB_STATUS.cancelled,
    JOB_STATUS.failed,
  ],
  "spawn-reserved": [
    JOB_STATUS.running,
    JOB_STATUS.retryWait,
    JOB_STATUS.cancelRequested,
    JOB_STATUS.cancelled,
    JOB_STATUS.failed,
  ],
  running: [
    JOB_STATUS.retryWait,
    JOB_STATUS.cancelRequested,
    JOB_STATUS.succeeded,
    JOB_STATUS.failed,
  ],
  "retry-wait": [JOB_STATUS.leased, JOB_STATUS.cancelled, JOB_STATUS.failed],
  "cancel-requested": [JOB_STATUS.cancelled, JOB_STATUS.failed],
  cancelled: [],
  succeeded: [],
  failed: [],
} as const satisfies Readonly<Record<JobStatus, readonly JobStatus[]>>;
export const JOB_TERMINAL_STATUSES = [
  JOB_STATUS.cancelled,
  JOB_STATUS.succeeded,
  JOB_STATUS.failed,
] as const;
export const JOB_LEASE_BOUND_STATUSES = [
  JOB_STATUS.leased,
  JOB_STATUS.spawnReserved,
  JOB_STATUS.running,
  JOB_STATUS.cancelRequested,
] as const;
export const JOB_LEASE_REQUIRED_STATUSES = [
  JOB_STATUS.leased,
  JOB_STATUS.spawnReserved,
  JOB_STATUS.running,
] as const;
const attemptBoundStatuses = new Set<JobStatus>([
  JOB_STATUS.spawnReserved,
  JOB_STATUS.running,
  JOB_STATUS.retryWait,
]);
export const TimestampSchema = z.string().datetime({ offset: true });
export const LeaseSchema = z
  .object({
    owner: z.string().trim().min(1).max(200),
    token: z.number().int().positive(),
    expiresAt: TimestampSchema,
  })
  .strict();
export type Lease = z.infer<typeof LeaseSchema>;
export const JobLineageSchema = z
  .object({
    kind: z.enum(["same-snapshot-retry", "new-snapshot-follow-up"]),
    parentJobId: JobIdSchema,
    parentSnapshotId: SnapshotIdSchema,
  })
  .strict();
export type JobLineage = z.infer<typeof JobLineageSchema>;
export const JobRecordSchema = z
  .object({
    jobId: JobIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    kind: z.enum(["research", "qa"]),
    logicalKey: z.string().trim().min(1).max(300),
    status: JobStatusSchema,
    createdAt: TimestampSchema,
    attemptId: AttemptIdSchema.optional(),
    lease: LeaseSchema.optional(),
    resultArtifactId: ArtifactIdSchema.optional(),
    lineage: JobLineageSchema.optional(),
  })
  .strict()
  .superRefine((job, context) => {
    if (
      JOB_LEASE_REQUIRED_STATUSES.includes(
        job.status as (typeof JOB_LEASE_REQUIRED_STATUSES)[number],
      ) &&
      job.lease === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["lease"],
        message: "lease-bound jobs must retain a lease",
      });
    }
    if (attemptBoundStatuses.has(job.status) && job.attemptId === undefined)
      context.addIssue({
        code: "custom",
        path: ["attemptId"],
        message: "spawned jobs must retain an attempt identity",
      });
    if (job.status === JOB_STATUS.queued && job.lease !== undefined)
      context.addIssue({
        code: "custom",
        path: ["lease"],
        message: "queued jobs cannot retain a lease",
      });
    if (
      job.status === JOB_STATUS.queued &&
      (job.attemptId !== undefined || job.resultArtifactId !== undefined)
    )
      context.addIssue({
        code: "custom",
        path: ["attemptId"],
        message: "queued jobs cannot retain attempt or result identities",
      });
    if (
      job.status === JOB_STATUS.succeeded &&
      job.resultArtifactId === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["resultArtifactId"],
        message: "succeeded jobs must retain their result artifact",
      });
    }
  });
export type JobRecordData = z.infer<typeof JobRecordSchema>;
export type JobRecord = JobRecordData & {
  readonly retry: (input: RetryInput) => RetryResult;
};
export type CreateJobInput = {
  readonly jobId: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly kind: "research" | "qa";
  readonly logicalKey: string;
  readonly createdAt: string;
};
export type RetryInput = {
  readonly attemptId: string;
  readonly kind: JobLineage["kind"];
  readonly snapshotId?: string;
  readonly childJobId?: string;
  readonly createdAt?: string;
};
export type JobError =
  | { readonly kind: "invalid_state"; readonly message: string }
  | {
      readonly kind: "illegal_transition";
      readonly from: JobStatus;
      readonly to: JobStatus;
    }
  | { readonly kind: "terminal_immutable"; readonly status: JobStatus }
  | { readonly kind: "lease_required" }
  | { readonly kind: "stale_lease" }
  | { readonly kind: "expired_lease" }
  | { readonly kind: "invalid_lease"; readonly message: string }
  | { readonly kind: "artifact_required" }
  | { readonly kind: "invalid_lineage"; readonly message: string }
  | { readonly kind: "duplicate_attempt" };
export type RetryResult =
  | { readonly ok: true; readonly job: JobRecord }
  | { readonly ok: false; readonly error: JobError };
export type JobTransitionContext = {
  readonly now: string;
  readonly lease?: Lease;
  readonly leaseOwner?: string;
  readonly leaseToken?: number;
  readonly resultArtifactId?: string;
};
export type JobTransitionResult =
  | { readonly ok: true; readonly state: JobRecord }
  | { readonly ok: false; readonly error: JobError };
export type ReserveSpawnContext = {
  readonly attemptId: string;
  readonly now: string;
  readonly lease: Lease;
  readonly eventLedger: EventLedger;
};
export type ReserveSpawnResult =
  | {
      readonly ok: true;
      readonly job: JobRecord;
      readonly attempt: AttemptRecord;
      readonly ledger: LaunchLedger;
      readonly eventLedger: EventLedger;
      readonly event: SpawnReservationEvent;
      readonly transaction: {
        readonly committed: true;
        readonly job: JobRecord;
        readonly attempt: AttemptRecord;
        readonly ordinal: number;
        readonly ledger: LaunchLedger;
        readonly eventLedger: EventLedger;
        readonly event: SpawnReservationEvent;
        readonly nextJobs: readonly JobRecord[];
      };
    }
  | { readonly ok: false; readonly error: JobError };

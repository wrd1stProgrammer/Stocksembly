import type {
  AttemptId,
  JobId,
  QuestionId,
  RunId,
  SnapshotId,
} from "../domain/ids";
import type {
  CreateRunInput,
  FinalizeRunCancellationInput,
  RequestRunCancellationInput,
  RunCancellationRequest,
} from "../server/persistence/postgres/types";
import type {
  AttemptOutcome,
  CapacityState,
  RunAdmissionResult,
} from "./leaseEngineTypes";

export type ClaimedJob = {
  readonly jobId: JobId;
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly kind: "research" | "qa";
  readonly logicalKey: string;
  readonly inputHash: string;
  readonly ownerId: string;
  readonly leaseToken: number;
  readonly leaseExpiresAt: string;
  readonly transientFailures: number;
  readonly retryClassification?: "transient" | "repair";
  readonly priorAttemptId?: AttemptId;
  readonly questionId?: QuestionId;
};

export type ReserveInput = {
  readonly claim: ClaimedJob;
  readonly attemptId: AttemptId;
  readonly eventId: string;
  readonly now: string;
};

export type ReservationResult =
  | { readonly kind: "reserved"; readonly ordinal: number }
  | { readonly kind: "capacity" }
  | { readonly kind: "incomplete" };

export type CommitInput = {
  readonly claim: ClaimedJob;
  readonly attemptId: AttemptId;
  readonly eventId: string;
  readonly now: string;
  readonly outcome: AttemptOutcome;
};

export interface LeaseEngineStore {
  readonly admit: (input: CreateRunInput) => Promise<RunAdmissionResult>;
  readonly activateNextRun: (eventId: string, now: string) => Promise<boolean>;
  readonly claim: (
    ownerId: string,
    now: string,
    expiresAt: string,
  ) => Promise<ClaimedJob | undefined>;
  readonly reserve: (input: ReserveInput) => Promise<ReservationResult>;
  readonly heartbeat: (
    claim: ClaimedJob,
    now: string,
    expiresAt: string,
  ) => Promise<boolean>;
  readonly cancellationRequested: (claim: ClaimedJob) => Promise<boolean>;
  readonly commit: (input: CommitInput) => Promise<boolean>;
  readonly release: (claim: ClaimedJob) => Promise<void>;
  readonly recoverExpired: (now: string) => Promise<readonly AttemptId[]>;
  readonly recoverCircuit: (runId: RunId, now: string) => Promise<boolean>;
  readonly capacity: () => Promise<CapacityState>;
  readonly requestCancellation: (
    input: RequestRunCancellationInput,
  ) => Promise<RunCancellationRequest>;
  readonly finalizeCancellation: (
    input: FinalizeRunCancellationInput,
  ) => Promise<boolean>;
  readonly close: () => Promise<void>;
}

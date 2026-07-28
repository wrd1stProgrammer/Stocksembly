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
} from "../server/persistence/sqlite/types";
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
  readonly admit: (input: CreateRunInput) => RunAdmissionResult;
  readonly activateNextRun: (eventId: string, now: string) => boolean;
  readonly claim: (
    ownerId: string,
    now: string,
    expiresAt: string,
  ) => ClaimedJob | undefined;
  readonly reserve: (input: ReserveInput) => ReservationResult;
  readonly heartbeat: (
    claim: ClaimedJob,
    now: string,
    expiresAt: string,
  ) => boolean;
  readonly cancellationRequested: (claim: ClaimedJob) => boolean;
  readonly commit: (input: CommitInput) => boolean;
  readonly release: (claim: ClaimedJob) => void;
  readonly recoverExpired: (now: string) => readonly AttemptId[];
  readonly recoverCircuit: (runId: RunId, now: string) => boolean;
  readonly capacity: () => CapacityState;
  readonly requestCancellation: (
    input: RequestRunCancellationInput,
  ) => RunCancellationRequest;
  readonly finalizeCancellation: (
    input: FinalizeRunCancellationInput,
  ) => boolean;
  readonly close: () => void;
}

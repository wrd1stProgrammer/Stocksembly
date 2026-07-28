import type {
  ArtifactId,
  AttemptId,
  EventId,
  JobId,
  QuestionId,
  ReportId,
  ReportVersionId,
  RunId,
  SnapshotId,
} from "../../../domain/ids";
import type { JobStatus } from "../../../domain/jobStateContracts";
import type { RunStatus } from "../../../domain/runStateContracts";
import type { TrustedCitationLocator } from "../../../ports/agentOutputCommit";
import type { JsonValue } from "./safeJson";

export type SqliteEventDraft = {
  readonly eventId: EventId;
  readonly type: string;
  readonly stateId: string;
  readonly occurredAt: string;
  readonly payload?: JsonValue;
  readonly jobId?: JobId;
  readonly attemptId?: AttemptId;
};

export type JobSeed = {
  readonly jobId: JobId;
  readonly kind: "research" | "qa";
  readonly logicalKey: string;
  readonly inputHash: string;
  readonly inputManifestHash?: string;
  readonly createdAt: string;
};

export type CreateRunInput = {
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly requestedAt: string;
  readonly initialJob: JobSeed;
  readonly initialEvent: SqliteEventDraft;
  readonly remainingBaseCalls?: number;
  readonly requestedOptionalCalls?: number;
  readonly requestedReplacementCalls?: number;
};

export type TransitionRunInput = {
  readonly runId: RunId;
  readonly fromStatus: RunStatus;
  readonly toStatus: RunStatus;
  readonly nextJobs: readonly JobSeed[];
  readonly event: SqliteEventDraft;
  readonly expectedVersion?: number;
};

export type AppendRunEventInput = {
  readonly runId: RunId;
  readonly event: SqliteEventDraft;
};

export type StoredRun = {
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly status: RunStatus;
  readonly lastEventSeq: number;
  readonly createdAt: string;
  readonly version: number;
  readonly remainingBaseCalls: number;
  readonly requestedOptionalCalls: number;
  readonly requestedReplacementCalls: number;
  readonly reportId?: ReportId;
  readonly lineage?: {
    readonly kind: "same-snapshot-retry" | "new-snapshot-follow-up";
    readonly parentRunId: RunId;
  };
  readonly priorReportId?: ReportId;
};

export type CreateChildRunInput = {
  readonly parentRunId: RunId;
  readonly childRunId: RunId;
  readonly kind: "same-snapshot-retry" | "new-snapshot-follow-up";
  readonly snapshotId?: SnapshotId;
  readonly priorReportId?: ReportId;
  readonly createdAt: string;
  readonly initialJob: JobSeed;
  readonly event: SqliteEventDraft;
};

export type RequestRunCancellationInput = {
  readonly runId: RunId;
  readonly eventId: EventId;
  readonly terminalEventId: EventId;
  readonly now: string;
};

export type RunCancellationRequest =
  | {
      readonly kind: "requested";
      readonly version: number;
      readonly activeAttemptIds: readonly AttemptId[];
    }
  | { readonly kind: "terminal_immutable"; readonly status: RunStatus };

export type FinalizeRunCancellationInput = Omit<
  RequestRunCancellationInput,
  "terminalEventId"
> & {
  readonly expectedVersion: number;
};

export type StoredJob = {
  readonly jobId: JobId;
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly kind: "research" | "qa";
  readonly logicalKey: string;
  readonly inputHash: string;
  readonly status: JobStatus;
  readonly attemptId?: AttemptId;
  readonly leaseOwner?: string;
  readonly leaseToken: number;
  readonly leaseExpiresAt?: string;
};

export type StoredEvent = {
  readonly runId: RunId;
  readonly sequence: number;
  readonly eventId: EventId;
  readonly type: string;
  readonly stateId: string;
  readonly occurredAt: string;
  readonly payload: JsonValue;
};

export type LeaseRequest = {
  readonly jobId: JobId;
  readonly ownerId: string;
  readonly now: string;
  readonly expiresAt: string;
};

export type LeaseGrant = {
  readonly ownerId: string;
  readonly token: number;
  readonly expiresAt: string;
};

export type FencedJobInput = {
  readonly jobId: JobId;
  readonly ownerId: string;
  readonly token: number;
  readonly now: string;
};

export type ReserveResearchLaunchInput = FencedJobInput & {
  readonly runId: RunId;
  readonly attemptId: AttemptId;
  readonly logicalArtifactKey: string;
  readonly inputHash: string;
  readonly reservedAt: string;
  readonly event: SqliteEventDraft;
  readonly replacementOfAttemptId?: AttemptId;
};

export type LaunchReservation = {
  readonly attemptId: AttemptId;
  readonly ordinal: number;
  readonly state: "burned";
};

export type StoredAttempt = {
  readonly attemptId: AttemptId;
  readonly jobId: JobId;
  readonly status: string;
  readonly ordinal?: number;
  readonly outcome?: string;
};

export type ArtifactMetadataInput = {
  readonly artifactId: ArtifactId;
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly logicalKey: string;
  readonly inputHash: string;
  readonly createdAt: string;
  readonly locator?: TrustedCitationLocator;
};

export type BindJobInputArtifact = {
  readonly jobId: JobId;
  readonly artifactId: ArtifactId;
};

export type ArtifactEdgeInput = {
  readonly childArtifactId: ArtifactId;
  readonly parentArtifactId: ArtifactId;
  readonly relation: string;
};

export type SaveReportVersionInput = {
  readonly reportId: ReportId;
  readonly versionId: ReportVersionId;
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly artifactId: ArtifactId;
  readonly status: "complete" | "complete_with_limitations" | "incomplete";
  readonly publishedAt: string;
  readonly publicPayload: JsonValue;
  readonly expectedVersion?: number;
  readonly priorVersionId?: ReportVersionId | null;
};

export type CreateQuestionInput = {
  readonly questionId: QuestionId;
  readonly retryOfQuestionId?: QuestionId;
  readonly reportId: ReportId;
  readonly reportVersionId: ReportVersionId;
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly jobId: JobId;
  readonly question: JsonValue;
  readonly createdAt: string;
};

export type ReserveQuestionLaunchInput = Omit<FencedJobInput, "jobId"> & {
  readonly questionId: QuestionId;
  readonly attemptId: AttemptId;
  readonly inputHash: string;
  readonly reservedAt: string;
  readonly event: SqliteEventDraft;
};

export type IdempotencyInput = {
  readonly scope: string;
  readonly key: string;
  readonly requestHash: string;
  readonly result: JsonValue;
  readonly createdAt: string;
};

export type IdempotencyResult = {
  readonly kind: "created" | "replayed";
  readonly result: JsonValue;
};

export type MaintenanceLeaseRequest = {
  readonly name: string;
  readonly ownerId: string;
  readonly now: string;
  readonly expiresAt: string;
};

export type MaintenanceLease = {
  readonly name: string;
  readonly ownerId: string;
  readonly phase: "draining" | "quiesced";
  readonly token: number;
  readonly expiresAt: string;
  readonly epoch: number;
};

export type MaintenanceFence = {
  readonly name: string;
  readonly ownerId: string;
  readonly token: number;
  readonly now: string;
};

export type SqlitePragmas = {
  readonly journalMode: "wal";
  readonly foreignKeys: 1;
  readonly synchronous: 2;
  readonly busyTimeout: 5_000;
  readonly walAutocheckpoint: 1_000;
};

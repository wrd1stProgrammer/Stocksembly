import type { AgentOutputCandidate } from "../domain/agentOutputs";
import type { SourceLocator } from "../domain/evidenceCoreSchemas";
import type {
  ArtifactId,
  AttemptId,
  EventId,
  JobId,
  RunId,
  SnapshotId,
} from "../domain/ids";
import type { AgentOutputStage } from "../domain/roleRegistry";
import type { ArtifactOwnerId } from "../domain/roleRegistryArtifacts";
import type { ArtifactDescriptor } from "./artifacts";

export type AgentOutputCommitBinding = {
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly jobId: JobId;
  readonly attemptId: AttemptId;
  readonly ordinal: number;
  readonly logicalArtifactId: string;
  readonly inputHash: string;
  readonly jobInputManifestHash: string;
  readonly attemptInputManifestHash: string;
  readonly promptHash: string;
  readonly schemaHash: string;
  readonly runnerBinaryHash: string;
  readonly runnerCliVersion: string;
  readonly runnerInputHash: string;
  readonly runnerStage: AgentOutputStage;
  readonly runnerModel: "gpt-5.6-terra" | "gpt-5.6-luna";
  readonly runnerReasoning: "low" | "medium";
  readonly runnerBrowsingPolicy: "disabled" | "audited_web";
  readonly runnerToolTranscriptHash: string;
  readonly status: "running";
  readonly currentFence: { readonly ownerId: string; readonly token: number };
  readonly citableArtifacts: readonly {
    readonly artifactId: ArtifactId;
    readonly runId: RunId;
    readonly snapshotId: SnapshotId;
    readonly contentHash: string;
    readonly locator: unknown;
  }[];
};

export type TrustedCitationLocator =
  | SourceLocator
  | {
      readonly kind: "web";
      readonly source: "codex_web";
      readonly sourceUrl: string;
      readonly title: string;
      readonly publisher: string;
      readonly retrievedAt: string;
      readonly excerpt: string;
      readonly contentHash: string;
    }
  | {
      readonly kind: "artifact";
      readonly artifactId: ArtifactId;
      readonly contentHash: string;
    };

export type TrustedAgentOutputEnvelope = {
  readonly workflowVersion: "WorkflowV1";
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly jobId: JobId;
  readonly attemptId: AttemptId;
  readonly ordinal: number;
  readonly logicalArtifactId: string;
  readonly roleId: ArtifactOwnerId;
  readonly stage: AgentOutputStage;
  readonly model: "gpt-5.6-terra" | "gpt-5.6-luna";
  readonly reasoning: "low" | "medium";
  readonly browsingPolicy: "disabled" | "audited_web";
  readonly toolTranscriptHash: string;
  readonly cliVersion:
    | "codex-cli 0.147.0-alpha.1.2"
    | "codex-cli 0.146.0-alpha.9.2"
    | "codex-cli 0.146.0-alpha.3.1"
    | "codex-cli 0.145.0";
  readonly cliBinaryHash: string;
  readonly promptHash: string;
  readonly schemaHash: string;
  readonly inputHash: string;
  readonly inputManifestHash: string;
  readonly outputHash: string;
  readonly citations: readonly {
    readonly artifactId: ArtifactId;
    readonly contentHash: string;
    readonly locator: TrustedCitationLocator;
  }[];
  readonly payload: AgentOutputCandidate;
};

export type AgentOutputCommitEvent = {
  readonly eventId: EventId;
  readonly type: string;
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly jobId: JobId;
  readonly attemptId: AttemptId;
  readonly artifactId: ArtifactId;
  readonly logicalArtifactId: string;
  readonly roleId: ArtifactOwnerId;
  readonly stage: AgentOutputStage;
  readonly outputHash: string;
  readonly occurredAt: string;
};

export type AtomicAgentOutputCommit = {
  readonly claim: {
    readonly ownerId: string;
    readonly token: number;
  };
  readonly expected: AgentOutputCommitBinding;
  readonly envelope: TrustedAgentOutputEnvelope;
  readonly descriptor: ArtifactDescriptor;
  readonly parentArtifactIds: readonly ArtifactId[];
  readonly event: AgentOutputCommitEvent;
};

export type MalformedAgentOutputRejection = {
  readonly expected: AgentOutputCommitBinding;
  readonly ownerId: string;
  readonly token: number;
  readonly attemptId: AttemptId;
  readonly burnedOrdinal: number;
  readonly replacementAttemptId: AttemptId;
  readonly replacementEventId: EventId;
  readonly occurredAt: string;
  readonly reason: "invalid_payload" | "invalid_citation";
};

export type AcceptedCommitResult =
  | { readonly kind: "committed"; readonly sequence: number }
  | { readonly kind: "duplicate" }
  | { readonly kind: "rejected" };

export type MalformedCommitResult =
  | { readonly kind: "replacement_reserved"; readonly ordinal: number }
  | { readonly kind: "incomplete" }
  | { readonly kind: "rejected" };

export interface AgentOutputCommitStorePort {
  readonly inspect: (claim: {
    readonly runId: RunId;
    readonly jobId: JobId;
    readonly attemptId: AttemptId;
    readonly ordinal: number;
    readonly ownerId: string;
    readonly token: number;
    readonly now: string;
  }) => Promise<unknown> | unknown;
  readonly commitAccepted: (
    input: AtomicAgentOutputCommit,
  ) => Promise<AcceptedCommitResult> | AcceptedCommitResult;
  readonly rejectMalformed: (
    input: MalformedAgentOutputRejection,
  ) => Promise<MalformedCommitResult> | MalformedCommitResult;
}

export type RecordAgentRunnerEvidenceInput = {
  readonly runId: RunId;
  readonly jobId: JobId;
  readonly attemptId: AttemptId;
  readonly ordinal: number;
  readonly ownerId: string;
  readonly token: number;
  readonly now: string;
  readonly stage: AgentOutputStage;
  readonly promptHash: string;
  readonly schemaHash: string;
  readonly inputHash: string;
  readonly binaryHash: string;
  readonly cliVersion: string;
  readonly model: "gpt-5.6-terra" | "gpt-5.6-luna";
  readonly reasoning: "low" | "medium";
  readonly browsingPolicy: "disabled" | "audited_web";
  readonly toolTranscriptHash: string;
};

export interface AgentRunnerEvidenceRecorderPort {
  readonly recordRunnerEvidence: (
    input: RecordAgentRunnerEvidenceInput,
  ) => Promise<boolean> | boolean;
}

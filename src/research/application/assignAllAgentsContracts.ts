import type {
  CapabilityDisclosure,
  CapabilityKey,
} from "../domain/capabilities";
import type { RightsSource } from "../domain/rights";
import type { SpecialistRoleId } from "../domain/roleRegistry";
import type {
  ManifestArtifact,
  SnapshotDataset,
  SnapshotManifest,
} from "./buildSnapshot";
import type {
  MandateLimitation,
  MaterialCrux,
  ResearchMandateV1,
} from "./createMandateContracts";

export type EvidenceSliceV1 = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly manifestHash: string;
  readonly mandateHash: string;
  readonly roleId: SpecialistRoleId;
  readonly artifacts: readonly ManifestArtifact[];
  readonly capabilities: readonly CapabilityDisclosure[];
  readonly sliceHash: string;
};

export type SpecialistAssignmentV1 = {
  readonly roleId: SpecialistRoleId;
  readonly agentName: string;
  readonly question?: string;
  readonly scope: ResearchMandateV1["scope"];
  readonly focusAreas: readonly string[];
  readonly activeCruxes: readonly MaterialCrux[];
  readonly allowedDatasets: readonly SnapshotDataset[];
  readonly allowedRightsSources: readonly RightsSource[];
  readonly capabilityKeys: readonly CapabilityKey[];
  readonly requiredOutputs: readonly string[];
  readonly forbiddenOutputs: readonly string[];
  readonly limitations: readonly MandateLimitation[];
  readonly evidenceSlice: EvidenceSliceV1;
  readonly assignmentHash: string;
};

export type ChairAssignmentV1 = {
  readonly roleId: "chair";
  readonly name: "Dr. Park";
  readonly mandateHash: string;
  readonly snapshotId: string;
  readonly permittedStage: "chair_synthesis";
  readonly assignmentHash: string;
};

export type AllAgentAssignmentsV1 = {
  readonly mandateHash: string;
  readonly assignments: readonly SpecialistAssignmentV1[];
  readonly chair: ChairAssignmentV1;
  readonly assignmentsHash: string;
};

export type AssignAllAgentsInput = {
  readonly mandate: ResearchMandateV1;
  readonly snapshot: SnapshotManifest;
  readonly rosterIds: readonly string[];
};

export type MandateSealedEvent = {
  readonly kind: "mandate_sealed";
  readonly runId: string;
  readonly snapshotId: string;
  readonly mandateHash: string;
  readonly at: string;
  readonly author: "system";
};

export interface MandateTransactionPort {
  readonly persistMandate: (mandate: ResearchMandateV1) => Promise<void>;
  readonly persistAssignments: (
    assignments: readonly SpecialistAssignmentV1[],
  ) => Promise<void>;
  readonly persistChair: (chair: ChairAssignmentV1) => Promise<void>;
  readonly appendMandateSealedEvent: (
    event: MandateSealedEvent,
  ) => Promise<void>;
}

export interface AssignmentRepositoryPort {
  readonly transaction: <Result>(
    operation: (transaction: MandateTransactionPort) => Promise<Result>,
  ) => Promise<Result>;
}

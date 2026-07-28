import type { CapabilityManifest } from "../domain/capabilities";
import {
  EVIDENCE_DATASETS,
  type EvidenceDataset,
} from "../domain/evidenceCoreSchemas";
import type { RightsSource } from "../domain/rights";
import type { ValueRegistry } from "../domain/valueRegistry";
import type {
  ArtifactCasPort,
  ArtifactDescriptor,
  ArtifactDigest,
} from "../ports/artifacts";

export const SNAPSHOT_DATASETS = EVIDENCE_DATASETS;
export type SnapshotDataset = EvidenceDataset;

export type SnapshotEvidence = {
  readonly evidenceId: string;
  readonly dataset: SnapshotDataset;
  readonly rightsSource: RightsSource;
  readonly retrievedAt: string;
  readonly raw: ArtifactDescriptor;
  readonly normalized?: ArtifactDescriptor;
  readonly form?: string;
  readonly accessionNumber?: string;
  readonly parentAccessionNumber?: string;
  readonly cik?: string;
  readonly filedAt?: string;
  readonly acceptedAt?: string;
  readonly current?: boolean;
};

export type SnapshotIdentity = {
  readonly cik: string;
  readonly ticker: string;
  readonly legalName: string;
  readonly exchange: string;
  readonly identityHash: string;
};

export type SnapshotVersions = {
  readonly schema: "snapshot-v1";
  readonly marketPack: string;
  readonly normalizationPolicy: string;
  readonly rightsPolicy: string;
  readonly adapters: Readonly<Record<string, string>>;
  readonly parsers: Readonly<Record<string, string>>;
  readonly calculations: Readonly<Record<string, string>>;
};

export type DatasetFailure = {
  readonly dataset: SnapshotDataset | "current_market_data" | "consensus";
  readonly code: string;
};

export type SnapshotTimes = {
  readonly requestedAt: string;
  readonly collectionStartedAt: string;
  readonly acquisitionClosedAt: string;
  readonly evidenceCutoffAt: string;
  readonly snapshotSealedAt: string;
  readonly mandateSealedAt: string;
};

export type SnapshotBuildInput = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly identity?: SnapshotIdentity;
  readonly requestedAt: string;
  readonly versions: SnapshotVersions;
  readonly capabilities: CapabilityManifest;
  readonly valueRegistry?: ValueRegistry;
  readonly failures: readonly DatasetFailure[];
  readonly collect: (register: SnapshotRegister) => Promise<void>;
};

export type SnapshotRegister = (evidence: SnapshotEvidence) => Promise<void>;

export type ManifestArtifact = {
  readonly evidenceId: string;
  readonly dataset: SnapshotDataset;
  readonly rightsSource: RightsSource;
  readonly retrievedAt: string;
  readonly rawHash: ArtifactDigest;
  readonly normalizedHash?: ArtifactDigest;
  readonly form?: string;
  readonly accessionNumber?: string;
  readonly parentAccessionNumber?: string;
  readonly cik?: string;
  readonly filedAt?: string;
  readonly acceptedAt?: string;
  readonly current?: boolean;
};

export type SnapshotManifestBody = {
  readonly schemaVersion: "snapshot-v1";
  readonly runId: string;
  readonly snapshotId: string;
  readonly identity: SnapshotIdentity;
  readonly requestedAt: string;
  readonly collectionStartedAt: string;
  readonly acquisitionClosedAt: string;
  readonly evidenceCutoffAt: string;
  readonly snapshotSealedAt: string;
  readonly versions: SnapshotVersions;
  readonly capabilities: CapabilityManifest;
  readonly artifacts: readonly ManifestArtifact[];
  readonly amendments: readonly {
    readonly accessionNumber: string;
    readonly parentAccessionNumber: string;
  }[];
  readonly valueRegistry: ValueRegistry;
  readonly rights: readonly {
    readonly source: RightsSource;
    readonly decision: "allowed";
  }[];
  readonly failures: readonly DatasetFailure[];
  readonly limitations: readonly string[];
};

export type SnapshotManifest = SnapshotManifestBody & {
  readonly manifestHash: string;
  readonly contentHash: string;
  readonly reuseKey: string;
};

export type EvidenceMandate = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly manifestHash: string;
  readonly sealedAt: string;
  readonly mandateHash: string;
};

export type SnapshotBuildResult =
  | {
      readonly kind: "sealed";
      readonly reused: boolean;
      readonly manifest: SnapshotManifest;
      readonly mandate: EvidenceMandate;
    }
  | {
      readonly kind: "incomplete";
      readonly reasons: readonly string[];
      readonly limitations: readonly string[];
    };

export type AcquisitionIdentity = {
  readonly runId: string;
  readonly snapshotId: string;
};

export type SnapshotCloseTimes = Pick<
  SnapshotTimes,
  "acquisitionClosedAt" | "evidenceCutoffAt"
>;

export interface SnapshotClockPort {
  readonly collectionStartedAt: () => string;
  readonly closeAndCutoff: () => SnapshotCloseTimes;
  readonly snapshotSealedAt: () => string;
  readonly mandateSealedAt: () => string;
}

export interface SnapshotRepositoryPort {
  readonly beginCollection: (
    input: AcquisitionIdentity & {
      readonly requestedAt: string;
      readonly collectionStartedAt: string;
    },
  ) => Promise<{ readonly collectionStartedAt: string }>;
  readonly registerRetrieval: (
    identity: AcquisitionIdentity,
    evidence: SnapshotEvidence,
  ) => Promise<void>;
  readonly closeAcquisitionAndRecordCutoff: (
    input: AcquisitionIdentity & {
      readonly acquisitionClosedAt: string;
      readonly evidenceCutoffAt: string;
    },
  ) => Promise<SnapshotCloseTimes>;
  readonly findSealedByReuseKey: (
    reuseKey: string,
  ) => Promise<
    | { readonly manifest: SnapshotManifest; readonly mandate: EvidenceMandate }
    | undefined
  >;
  readonly sealSnapshot: (manifest: SnapshotManifest) => Promise<void>;
  readonly sealMandate: (mandate: EvidenceMandate) => Promise<void>;
  readonly openAgentManifest: (
    manifestHash: string,
  ) => Promise<SnapshotManifest | undefined>;
}

export type SnapshotBuilderDependencies = {
  readonly cas: ArtifactCasPort;
  readonly clock: SnapshotClockPort;
  readonly repository: SnapshotRepositoryPort;
};

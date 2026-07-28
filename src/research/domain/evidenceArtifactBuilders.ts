import {
  type AgentArtifact,
  AgentArtifactSchema,
  artifactContentHash,
  type NormalizedArtifact,
  NormalizedArtifactSchema,
  type ReportArtifact,
  ReportArtifactSchema,
} from "./evidenceSchemas";

type ArtifactBuilderBase = {
  readonly artifactId: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly parentHashes: readonly string[];
};

export function createNormalizedArtifact(
  input: ArtifactBuilderBase & {
    readonly content: string;
    readonly sourceHashes: readonly string[];
    readonly parserVersion: string;
  },
): NormalizedArtifact {
  return NormalizedArtifactSchema.parse({
    ...input,
    kind: "normalized",
    parentHashes: [...input.parentHashes],
    contentHash: artifactContentHash({
      ...input,
      kind: "normalized" as const,
      parentHashes: [...input.parentHashes],
    }),
  });
}

export function createAgentArtifact(
  input: ArtifactBuilderBase & {
    readonly role: string;
    readonly content: string;
    readonly inputManifestHash: string;
    readonly schemaVersion: string;
  },
): AgentArtifact {
  return AgentArtifactSchema.parse({
    ...input,
    kind: "agent",
    parentHashes: [...input.parentHashes],
    contentHash: artifactContentHash({
      ...input,
      kind: "agent" as const,
      parentHashes: [...input.parentHashes],
    }),
  });
}

export function createReportArtifact(
  input: ArtifactBuilderBase & {
    readonly content: string;
    readonly inputManifestHash: string;
    readonly schemaVersion: string;
  },
): ReportArtifact {
  return ReportArtifactSchema.parse({
    ...input,
    kind: "report",
    parentHashes: [...input.parentHashes],
    contentHash: artifactContentHash({
      ...input,
      kind: "report" as const,
      parentHashes: [...input.parentHashes],
    }),
  });
}

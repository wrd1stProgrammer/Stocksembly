import type {
  ArtifactId,
  ReportId,
  ReportVersionId,
  RunId,
  SnapshotId,
} from "../domain/ids";

type PublicJson =
  | null
  | boolean
  | number
  | string
  | readonly PublicJson[]
  | { readonly [key: string]: PublicJson };

export type ReportVersionWrite = {
  readonly reportId: ReportId;
  readonly versionId: ReportVersionId;
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly artifactId: ArtifactId;
  readonly status: "complete" | "complete_with_limitations" | "incomplete";
  readonly publishedAt: string;
  readonly publicPayload: {
    readonly schemaVersion: "workflow-v1" | "workflow-v2";
    readonly reportArtifactDigest: string;
    readonly version: number;
    readonly priorVersionId: ReportVersionId | null;
    readonly status: "complete" | "complete_with_limitations" | "incomplete";
    readonly claimIds: readonly string[];
    readonly sourceIds: readonly string[];
    readonly limitationIds: readonly string[];
    readonly anticipatedQuestions?: readonly PublicJson[];
    readonly editorialPublication?: PublicJson;
  };
  readonly expectedVersion?: number;
  readonly priorVersionId?: ReportVersionId | null;
};

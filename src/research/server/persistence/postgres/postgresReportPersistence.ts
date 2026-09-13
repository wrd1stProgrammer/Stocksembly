import type {
  AuthoritativeReportCommit,
  ReportVersionPersistence,
} from "../../../application/assembleReportPersistence";
import { ArtifactIdSchema } from "../../../domain/ids";
import type { PostgresStore } from "./postgresStore";

export function postgresReportVersionPersistence(
  store: PostgresStore,
): ReportVersionPersistence {
  return {
    async save(commit: AuthoritativeReportCommit): Promise<number> {
      return store.transaction(async (transaction) => {
        await transaction.saveArtifactMetadata({
          artifactId: commit.descriptor.artifactId,
          runId: commit.descriptor.runId,
          snapshotId: commit.descriptor.snapshotId,
          contentHash: commit.descriptor.digest,
          byteLength: commit.descriptor.byteLength,
          mediaType: commit.descriptor.mediaType,
          logicalKey: `report_version:${commit.version.versionId}`,
          inputHash: commit.descriptor.digest,
          createdAt: commit.version.publishedAt,
        });
        for (const parentArtifactId of commit.parentArtifactIds)
          await transaction.addArtifactEdge({
            childArtifactId: commit.descriptor.artifactId,
            parentArtifactId: ArtifactIdSchema.parse(parentArtifactId),
            relation: "derived-from",
          });
        return transaction.saveReportVersion(commit.version);
      });
    },
  };
}

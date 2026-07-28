import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  ArtifactIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../src/research/domain/ids";
import {
  type ResearchReport,
  ResearchReportSchema,
} from "../../../src/research/domain/report";
import { validReport } from "../../../src/research/domain/report.testSupport";
import { createFilesystemArtifactStore } from "../../../src/research/server/artifacts/filesystemArtifactStore";
import type { ApiHarness } from "./researchRoutes.testSupport";

export async function seedPublishedReport(
  harness: ApiHarness,
  run: { readonly runId: string; readonly snapshotId: string },
): Promise<{ readonly reportId: string; readonly body: ResearchReport }> {
  const reportId = randomUUID();
  const versionId = randomUUID();
  const artifactId = randomUUID();
  const report = ResearchReportSchema.parse({
    ...validReport(),
    reportId,
    versionId,
    runId: run.runId,
    snapshotId: run.snapshotId,
    artifacts: validReport().artifacts.map((artifact) => ({
      ...artifact,
      runId: run.runId,
      snapshotId: run.snapshotId,
    })),
  });
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  const store = createFilesystemArtifactStore({
    dataDirectory: harness.root,
    maxBlobBytes: 1024 * 1024,
    metadata: {
      commit: () => Promise.resolve(),
      find: () => Promise.resolve(undefined),
    },
  });
  const descriptor = await store.put({
    artifactId: ArtifactIdSchema.parse(artifactId),
    runId: RunIdSchema.parse(run.runId),
    snapshotId: SnapshotIdSchema.parse(run.snapshotId),
    mediaType: "application/vnd.stocksembly.research-report+json",
    parentDigests: [],
    bytes,
  });
  const database = new Database(harness.databasePath);
  database.pragma("foreign_keys = ON");
  database
    .transaction(() => {
      database
        .prepare(`INSERT INTO artifacts(
      artifact_id, run_id, snapshot_id, content_hash, byte_length,
      media_type, logical_key, input_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          artifactId,
          run.runId,
          run.snapshotId,
          descriptor.digest,
          descriptor.byteLength,
          descriptor.mediaType,
          `report_version:${versionId}`,
          descriptor.digest,
          "2026-07-23T06:00:00.000Z",
        );
      database
        .prepare(`INSERT INTO reports(
      report_id, run_id, snapshot_id, state, created_at
    ) VALUES (?, ?, ?, 'published', ?)`)
        .run(reportId, run.runId, run.snapshotId, "2026-07-23T06:00:00.000Z");
      database
        .prepare(`INSERT INTO report_versions(
      version_id, report_id, run_id, snapshot_id, version, artifact_id,
      status, published_at, public_payload_json
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`)
        .run(
          versionId,
          reportId,
          run.runId,
          run.snapshotId,
          artifactId,
          report.status,
          "2026-07-23T06:00:00.000Z",
          JSON.stringify({
            schemaVersion: "workflow-v1",
            reportArtifactDigest: descriptor.digest,
            version: 1,
            priorVersionId: null,
            status: report.status,
            claimIds: report.claims.map((claim) => claim.claimId),
            sourceIds: report.sources.map((source) => source.sourceId),
            limitationIds: report.limitations.map(
              (limitation) => limitation.id,
            ),
          }),
        );
    })
    .immediate();
  database.close();
  return { reportId, body: report };
}

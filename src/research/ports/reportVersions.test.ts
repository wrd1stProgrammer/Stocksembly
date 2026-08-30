import { describe, expect, it } from "vitest";
import {
  ArtifactIdSchema,
  ReportIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import type { ReportVersionWrite } from "./reportVersions";

describe("ReportVersionWrite workflow-v3", () => {
  it("carries the trusted source locale in the version payload", () => {
    const value = {
      reportId: ReportIdSchema.parse("00000000-0000-4000-8000-000000000001"),
      versionId: ReportVersionIdSchema.parse(
        "00000000-0000-4000-8000-000000000002",
      ),
      runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000003"),
      snapshotId: SnapshotIdSchema.parse(
        "00000000-0000-4000-8000-000000000004",
      ),
      artifactId: ArtifactIdSchema.parse(
        "00000000-0000-4000-8000-000000000005",
      ),
      status: "complete" as const,
      publishedAt: "2026-08-29T00:00:00.000Z",
      publicPayload: {
        schemaVersion: "workflow-v3" as const,
        sourceLocale: "ko" as const,
        reportArtifactDigest: "a".repeat(64),
        version: 1,
        priorVersionId: null,
        status: "complete" as const,
        claimIds: [],
        sourceIds: [],
        limitationIds: [],
      },
    } satisfies ReportVersionWrite;
    expect(value.publicPayload).toMatchObject({
      schemaVersion: "workflow-v3",
      sourceLocale: "ko",
    });
  });
});

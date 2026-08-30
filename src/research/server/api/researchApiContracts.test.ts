import { describe, expect, it } from "vitest";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import type { PublicReportLoader } from "./researchApiContracts";

describe("PublicReportLoader workflow-v3", () => {
  it("returns a canonical report without requiring a mirrored locale", async () => {
    const loader: PublicReportLoader = async () =>
      workflowV3PresentationFixture("en");
    const report = await loader({
      reportId: "report",
      artifactId: "artifact",
      artifactDigest: "a".repeat(64),
      runId: "run",
      snapshotId: "snapshot",
      versionId: "version",
      version: 1,
      status: "complete",
      publishedAt: "2026-08-29T00:00:00.000Z",
      payload: {},
    });
    expect(report?.schemaVersion).toBe("workflow-v3");
    expect(report).not.toHaveProperty("locales");
  });
});

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ResearchFileQuestions } from "../../../components/research/file/ResearchFileQuestions";
import { type ResearchReport, ResearchReportSchema } from "../../domain/report";
import { validReport } from "../../domain/report.testSupport";
import { researchReportToFile } from "../../researchReportToFile";
import { workflowV2PresentationFixture } from "../../workflowV2Presentation.testSupport";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import { resolveArtifactBlobPath } from "../artifacts/filesystemArtifactPaths";
import type { PublicReport } from "./researchApiContracts";
import { loadPublicResearchReport } from "./researchApiReportReader";

const roots: string[] = [];

async function storedPublication(
  report:
    | ReturnType<typeof workflowV2PresentationFixture>
    | ReturnType<typeof workflowV3PresentationFixture>
    | ResearchReport,
) {
  const dataRoot = await mkdtemp(join(tmpdir(), "stocksembly-report-reader-"));
  roots.push(dataRoot);
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  const digest = createHash("sha256").update(bytes).digest("hex");
  const path = resolveArtifactBlobPath(dataRoot, digest);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, bytes, { mode: 0o600 });
  const publication: PublicReport = {
    reportId: report.reportId,
    artifactId: "00000000-0000-4000-8000-000000000094",
    artifactDigest: digest,
    runId: report.runId,
    snapshotId: report.snapshotId,
    versionId: report.versionId,
    version: report.version,
    status: report.status,
    publishedAt: "2026-07-31T00:00:00.000Z",
    payload: {
      schemaVersion: report.schemaVersion,
      reportArtifactDigest: digest,
      version: report.version,
      priorVersionId: report.versionDelta.priorVersionId,
      status: report.status,
      claimIds: report.claims.map((claim) => claim.claimId),
      sourceIds: report.sources.map((source) => source.sourceId),
      limitationIds: report.limitations.map((limitation) => limitation.id),
      ...(report.schemaVersion === "workflow-v2" ||
      report.schemaVersion === "workflow-v3"
        ? {
            anticipatedQuestions: report.anticipatedQuestions,
            editorialPublication: { gateVersion: "editorial-quality-v1" },
            ...(report.schemaVersion === "workflow-v3"
              ? { sourceLocale: report.sourceLocale }
              : {}),
          }
        : {}),
    },
  };
  return { dataRoot, publication };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => await rm(root, { recursive: true })),
  );
});

describe("loadPublicResearchReport versioned presentation path", () => {
  it("loads a stored workflow-v2 artifact and selects the v2 file mapper", async () => {
    // Given
    const stored = await storedPublication(workflowV2PresentationFixture());

    // When
    const report = await loadPublicResearchReport(
      { dataRoot: stored.dataRoot },
      stored.publication,
    );
    const file =
      report === undefined
        ? undefined
        : researchReportToFile(report, stored.publication.publishedAt);
    const rendered =
      file === undefined
        ? undefined
        : render(createElement(ResearchFileQuestions, { file, locale: "en" }));

    // Then
    expect(report?.schemaVersion).toBe("workflow-v2");
    expect(file?.presentationVersion).toBe("workflow-v2");
    expect(file?.structuredEditorial?.decision).toEqual(
      workflowV2PresentationFixture().editorialDecision,
    );
    expect(file?.anticipatedQuestions).toHaveLength(10);
    expect(
      rendered?.container.querySelectorAll(
        ":scope > section > .research-anticipated-qa__grid > article",
      ),
    ).toHaveLength(10);
    expect(rendered?.container.querySelector("details")).toBeNull();
  });

  it.each(["en", "ko"] as const)(
    "loads workflow-v3 %s without requiring a mirrored locale",
    async (sourceLocale) => {
      const canonical = workflowV3PresentationFixture(sourceLocale);
      const stored = await storedPublication(canonical);

      const report = await loadPublicResearchReport(
        { dataRoot: stored.dataRoot },
        stored.publication,
      );
      const file =
        report === undefined
          ? undefined
          : researchReportToFile(report, stored.publication.publishedAt);

      expect(report).toEqual(canonical);
      expect(report).not.toHaveProperty("locales");
      expect(file?.presentationVersion).toBe("workflow-v2");
      expect(file?.structuredEditorial?.decision.stance).toBe("balanced");
      expect(
        file?.structuredEditorial?.decision.decisiveReason[sourceLocale],
      ).toBe(canonical.editorialDecision.decisiveReason);
    },
  );

  it("keeps stored workflow-v1 loading read-only before and after v2", async () => {
    // Given
    const legacy = ResearchReportSchema.parse(validReport());
    const beforeSource = structuredClone(legacy);
    const legacyStored = await storedPublication(legacy);
    const v2Stored = await storedPublication(workflowV2PresentationFixture());

    // When
    const before = await loadPublicResearchReport(
      { dataRoot: legacyStored.dataRoot },
      legacyStored.publication,
    );
    await loadPublicResearchReport(
      { dataRoot: v2Stored.dataRoot },
      v2Stored.publication,
    );
    const after = await loadPublicResearchReport(
      { dataRoot: legacyStored.dataRoot },
      legacyStored.publication,
    );

    // Then
    expect(before).toEqual(after);
    expect(after?.schemaVersion).toBe("workflow-v1");
    expect(legacy).toEqual(beforeSource);
  });

  it("rejects a publication pointer that does not bind to its CAS digest", async () => {
    // Given
    const stored = await storedPublication(workflowV2PresentationFixture());

    // When
    const report = await loadPublicResearchReport(
      { dataRoot: stored.dataRoot },
      {
        ...stored.publication,
        artifactDigest: "0".repeat(64),
      },
    );

    // Then
    expect(report).toBeUndefined();
  });
});

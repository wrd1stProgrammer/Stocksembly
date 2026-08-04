import { describe, expect, it } from "vitest";
import {
  ResearchReportSchema,
  WorkflowV2ResearchReportSchema,
} from "./domain/report";
import { validReport } from "./domain/report.testSupport";
import { buildResearchFileEditorialModel } from "./researchFileEditorialModel";
import { researchReportToFile } from "./researchReportToFile";
import {
  departmentWorkflowV2PresentationFixture,
  workflowV2PresentationFixture,
  workflowV2PresentationMetricId,
} from "./workflowV2Presentation.testSupport";

describe("researchReportToFile presentation version boundary", () => {
  it("preserves legacy-v1 output and never mutates its source artifact", () => {
    // Given
    const report = ResearchReportSchema.parse(validReport());
    const before = structuredClone(report);

    // When
    const first = researchReportToFile(report, "2026-07-31T00:00:00.000Z");
    const second = researchReportToFile(report, "2026-07-31T00:00:00.000Z");

    // Then
    expect(first).toEqual(second);
    expect(first.presentationVersion).toBe("legacy-v1");
    expect(report).toEqual(before);
  });

  it("maps workflow-v2 owned evidence without global checkpoints or generated Q&A", () => {
    // Given
    const report = workflowV2PresentationFixture();

    // When
    const file = researchReportToFile(report, "2026-07-31T00:00:00.000Z");
    const model = buildResearchFileEditorialModel(file, "en");

    // Then
    expect(file.presentationVersion).toBe("workflow-v2");
    expect(file.claimMatrix?.map((claim) => claim.id)).toEqual(
      report.editorialClaims.map((claim) => claim.claimId),
    );
    expect(file.claimMatrix?.map((claim) => claim.checkpoint)).toEqual(
      report.editorialClaims.map((claim) => claim.falsifier),
    );
    expect(file.claimMatrix?.[0]?.decisiveMetricIds).toEqual([
      workflowV2PresentationMetricId,
    ]);
    expect(file.structuredEditorial?.comparators).toEqual(report.comparators);
    expect(file.structuredEditorial?.claimRegister).toEqual(report.claims);
    expect(
      file.structuredEditorial?.claimRegister.map((claim) => ({
        claimId: claim.claimId,
        disposition: claim.disposition,
        originClaimId: claim.originClaimId,
        sourceIds: claim.sourceIds,
      })),
    ).toEqual(
      report.claims.map((claim) => ({
        claimId: claim.claimId,
        disposition: claim.disposition,
        originClaimId: claim.originClaimId,
        sourceIds: claim.sourceIds,
      })),
    );
    expect(file.reportDecisionFalsifier).toEqual(
      report.editorialDecision.falsifier,
    );
    expect(file.changeCondition).toEqual({ en: "", ko: "" });
    expect(file.postureLabel).toEqual({ en: "", ko: "" });
    expect(file.anticipatedQuestions?.map((question) => question.rank)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    expect(
      new Set(
        file.anticipatedQuestions?.map((question) => question.question.en),
      ),
    ).toHaveProperty("size", 10);
    expect(
      JSON.stringify(
        file.anticipatedQuestions?.map(({ question, answer }) => ({
          question,
          answer,
        })),
      ),
    ).not.toMatch(/_[a-z0-9]{8}(?:["\s])/u);
    expect(model.directAnswer).toBe(report.editorialDecision.decisiveReason.en);
    expect(model.debates).toEqual([]);
    expect(model.comparisonRows).toEqual([]);
  });

  it("keeps published workflow-v2 analysis visible when legacy claim rows have no disposition", () => {
    const source = workflowV2PresentationFixture();
    const report = WorkflowV2ResearchReportSchema.parse({
      ...source,
      claims: source.claims.map(
        ({
          disposition: _disposition,
          originClaimId: _origin,
          revisionHash: _revision,
          ...claim
        }) => claim,
      ),
    });

    const file = researchReportToFile(report, "2026-08-01T00:00:00.000Z");
    const model = buildResearchFileEditorialModel(file, "en");

    expect(
      file.structuredEditorial?.claimRegister.every(
        (claim) => claim.disposition === "accepted",
      ),
    ).toBe(true);
    expect(model.structuredClaims).toHaveLength(report.editorialClaims.length);
  });

  it("omits v2 scenarios and prose modules when their owned inputs are absent", () => {
    // Given
    const report = workflowV2PresentationFixture();
    const missingInputs = WorkflowV2ResearchReportSchema.parse({
      ...report,
      locales: {
        en: { ...report.locales.en, scenarios: [] },
        ko: { ...report.locales.ko, scenarios: [] },
      },
      marketSnapshot: undefined,
      metricSnapshot: undefined,
      comparators: [],
    });

    // When
    const file = researchReportToFile(
      missingInputs,
      "2026-07-31T00:00:00.000Z",
    );
    const model = buildResearchFileEditorialModel(file, "en");
    const serialized = JSON.stringify({ file, model });

    // Then
    expect(file.marketSnapshot).toBeUndefined();
    expect(file.scenarios).toEqual([]);
    expect(model.scenarios).toEqual([]);
    expect(model.comparisonRows).toEqual([]);
    expect(model.visualMetrics).toEqual([]);
    expect(file.limitationNote).toEqual({ en: "", ko: "" });
    expect(serialized).not.toContain("Current price unavailable");
    expect(serialized).not.toContain("verified operating evidence");
  });

  it("does not leak state when v1 and v2 reports are mapped in alternating order", () => {
    // Given
    const legacy = ResearchReportSchema.parse(validReport());
    const workflowV2 = workflowV2PresentationFixture();

    // When
    const before = researchReportToFile(legacy, "2026-07-31T00:00:00.000Z");
    const middle = researchReportToFile(workflowV2, "2026-07-31T00:00:00.000Z");
    const after = researchReportToFile(legacy, "2026-07-31T00:00:00.000Z");

    // Then
    expect(before).toEqual(after);
    expect(middle.presentationVersion).toBe("workflow-v2");
    expect(after.structuredEditorial).toBeUndefined();
  });

  it("maps committee and four department fixtures to distinct owned public models", () => {
    // Given
    const reports = [
      workflowV2PresentationFixture(),
      ...(["market", "company", "financial", "risk"] as const).map(
        departmentWorkflowV2PresentationFixture,
      ),
    ];

    // When
    const ownershipSurfaces = reports.map((report) => {
      const file = researchReportToFile(report, "2026-07-31T00:00:00.000Z");
      return JSON.stringify({
        target: file.researchTarget,
        owners: file.structuredEditorial?.claims.map(
          (claim) => claim.roleOwner,
        ),
        decision: file.structuredEditorial?.decision.decisiveReason,
      });
    });

    // Then
    expect(new Set(ownershipSurfaces).size).toBe(5);
  });

  it("rejects malformed v2 ownership, scenario inputs, and Q&A evidence metadata", () => {
    // Given
    const report = workflowV2PresentationFixture();
    const unknownClaimId = "00000000-0000-4000-8000-000000000095";

    // When
    const missingOwnership = WorkflowV2ResearchReportSchema.safeParse({
      ...report,
      editorialDecision: {
        ...report.editorialDecision,
        primaryClaimIds: [unknownClaimId],
      },
    });
    const scenarioWithoutAssumptions = WorkflowV2ResearchReportSchema.safeParse(
      {
        ...report,
        locales: {
          en: {
            ...report.locales.en,
            scenarios: report.locales.en.scenarios.map((scenario) => ({
              ...scenario,
              assumptions: [],
            })),
          },
          ko: {
            ...report.locales.ko,
            scenarios: report.locales.ko.scenarios.map((scenario) => ({
              ...scenario,
              assumptions: [],
            })),
          },
        },
      },
    );
    const qaWithoutEvidenceOrRank = WorkflowV2ResearchReportSchema.safeParse({
      ...report,
      anticipatedQuestions: report.anticipatedQuestions.map(
        ({ evidenceArtifactIds: _evidence, rank: _rank, ...question }) =>
          question,
      ),
    });

    // Then
    expect(missingOwnership.success).toBe(false);
    expect(scenarioWithoutAssumptions.success).toBe(false);
    expect(qaWithoutEvidenceOrRank.success).toBe(false);
  });

  it("omits a focused department claim owned by another team's registered role", () => {
    // Given
    const report = departmentWorkflowV2PresentationFixture("company");
    const wrongOwnerReport = {
      ...report,
      editorialClaims: report.editorialClaims.map((claim) => ({
        ...claim,
        roleOwner: "market_news",
      })),
    };

    // When
    const file = researchReportToFile(
      wrongOwnerReport,
      "2026-07-31T00:00:00.000Z",
    );

    // Then
    expect(file.structuredEditorial?.claims).toEqual([]);
    expect(file.claimMatrix).toEqual([]);
  });
});

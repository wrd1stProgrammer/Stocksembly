import { describe, expect, it } from "vitest";
import { validReport } from "./report.testSupport";
import {
  parseStoredResearchReport,
  parseStoredResearchReportForPresentation,
  selectPublisherReportVersion,
  singleLocaleReportForStorage,
} from "./reportStorage";

function validV2Report() {
  const report = structuredClone(validReport());
  const claimId = report.claims[0]!.claimId;
  const evidenceArtifactId = report.artifacts[0]!.artifactId;
  const text = {
    en: "Current cash conversion supports the margin thesis.",
    ko: "현재 현금 전환은 마진 논지를 뒷받침합니다.",
  };
  const falsifier = {
    en: "Two consecutive quarters of deterioration would falsify the thesis.",
    ko: "두 분기 연속 악화되면 논지는 기각됩니다.",
  };
  return {
    ...report,
    schemaVersion: "workflow-v2",
    editorialClaims: [
      {
        claimId,
        decisionDimension: "margin",
        roleOwner: "financial_quality",
        stanceContribution: "supports",
        materiality: "material",
        publicThesis: text,
        evidenceArtifactIds: [evidenceArtifactId],
        counterevidenceArtifactIds: [],
        decisiveMetricIds: [],
        falsifier,
      },
    ],
    editorialDecision: {
      stance: "upside_skewed",
      confidence: "medium",
      decisiveReason: text,
      strongestCountercase: falsifier,
      falsifier,
      primaryClaimIds: [claimId],
    },
    comparators: [
      {
        comparatorId: "peer-a",
        role: "direct_competitor",
        rationale: text,
        comparableMetricKeys: ["operating_margin"],
      },
    ],
    anticipatedQuestions: [
      {
        questionId: "00000000-0000-4000-8000-000000000099",
        decisionKey: "margin_durability",
        question: {
          en: "What breaks the thesis?",
          ko: "무엇이 논지를 깨뜨리나요?",
        },
        answer: falsifier,
        primaryClaimIds: [claimId],
        evidenceArtifactIds: [evidenceArtifactId],
        rank: 1,
      },
    ],
  };
}

describe("single-locale report storage", () => {
  it("loads an untouched workflow-v1 artifact without manufacturing v2 fields", () => {
    const stored = structuredClone(validReport());
    const restored = parseStoredResearchReport(stored);

    expect(restored.schemaVersion).toBe("workflow-v1");
    expect(restored).toEqual({
      ...stored,
      researchTarget: { kind: "committee" },
    });
    expect(restored).not.toHaveProperty("editorialDecision");
    expect(restored).not.toHaveProperty("anticipatedQuestions");
  });

  it("stores only the selected narrative language and restores legacy readers", () => {
    const report = validReport();
    const stored = singleLocaleReportForStorage(
      parseStoredResearchReport(report),
      "ko",
    );
    const serialized = JSON.stringify(stored);

    expect(stored["schemaVersion"]).toBe("workflow-v1-single-locale");
    expect(stored["locale"]).toBe("ko");
    expect(stored).not.toHaveProperty("locales");
    expect(serialized).toContain("수요는 견조합니다.");
    expect(serialized).not.toContain("Demand remains constructive.");

    const restored = parseStoredResearchReport(stored);
    expect(restored.locales.ko).toEqual(restored.locales.en);
    expect(restored.teamViews[0]?.position.ko).toBe("수요는 견조합니다.");
    expect(restored.teamViews[0]?.position.en).toBe("수요는 견조합니다.");
  });

  it("loads v1 read-only and v2 sequentially without backfill or cross-version mutation", () => {
    const v1 = structuredClone(validReport());
    const v2 = validV2Report();
    const beforeV1 = JSON.stringify(v1);
    const beforeV2 = JSON.stringify(v2);

    const legacy = parseStoredResearchReportForPresentation(v1);
    expect(legacy.kind).toBe("legacy-v1-read-only");
    expect(parseStoredResearchReportForPresentation(v2).kind).toBe(
      "workflow-v2",
    );
    expect(
      selectPublisherReportVersion({
        workflowV1: v1,
        workflowV2: v2,
        rollbackToV1: true,
      }).schemaVersion,
    ).toBe("workflow-v1");
    expect(JSON.stringify(v1)).toBe(beforeV1);
    expect(JSON.stringify(v2)).toBe(beforeV2);
  });
});

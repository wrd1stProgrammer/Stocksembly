import { describe, expect, it } from "vitest";
import { researchFileFixture } from "./mockResearchFile";
import { buildResearchFileEditorialModel } from "./researchFileEditorialModel";

describe("buildResearchFileEditorialModel", () => {
  it("turns the report into populated reader-facing judgments without empty-link fallbacks", () => {
    const model = buildResearchFileEditorialModel(researchFileFixture, "ko");
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain("별도로 연결되지 않았습니다");
    expect(serialized).not.toContain("별도로 지정되지 않았습니다");
    expect(serialized).not.toContain("별도 취약점이 없습니다");
    expect(serialized).not.toContain("기본 시나리오");
    expect(model.lensRows.every((row) => row.content.length > 20)).toBe(true);
    expect(
      model.analysisRows.every(
        (row) =>
          row.agentView.length > 0 &&
          row.evidence.length > 0 &&
          row.counterpoint.length > 0 &&
          row.checkpoint.length > 0,
      ),
    ).toBe(true);
    expect(
      model.comparisonRows.every((row) => row.interpretation.length > 0),
    ).toBe(true);
  });

  it("builds a decision-dense snapshot, valuation conclusion, and debate record", () => {
    const model = buildResearchFileEditorialModel(researchFileFixture, "ko");

    expect(model.companySnapshot.length).toBeGreaterThanOrEqual(5);
    expect(model.companySnapshot.every((row) => row.value.length > 10)).toBe(
      true,
    );
    expect(model.directAnswer.length).toBeGreaterThan(
      researchFileFixture.thesis.ko.length,
    );
    expect(model.valuationConclusion.length).toBeGreaterThan(
      researchFileFixture.valuation.ko.length,
    );
    expect(model.debates.length).toBeGreaterThanOrEqual(2);
    expect(
      model.debates.every(
        (debate) =>
          debate.claim.length > 20 &&
          debate.counterargument.length > 20 &&
          debate.recheckedEvidence.length > 20 &&
          debate.chairRuling.length > 20,
      ),
    ).toBe(true);
    expect(model.finalView.length).toBeGreaterThan(model.directAnswer.length);
  });

  it("opens with a numeric team conclusion and structured catalyst and risk copy", () => {
    const model = buildResearchFileEditorialModel(researchFileFixture, "ko");
    const numericModel = model as typeof model & {
      readonly conclusionIndex?: number;
      readonly evidenceReliability?: number;
      readonly headlineMetrics?: readonly {
        readonly label: string;
        readonly value: string;
      }[];
    };

    expect(numericModel.conclusionIndex).toBeGreaterThanOrEqual(0);
    expect(numericModel.conclusionIndex).toBeLessThanOrEqual(100);
    expect(numericModel.evidenceReliability).toBe(86);
    expect(numericModel.headlineMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "현재가", value: "USD 172.41" }),
        expect.objectContaining({ label: "팀 동의", value: "75%" }),
      ]),
    );
    expect(
      model.catalysts.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "headline" in item &&
          "body" in item,
      ),
    ).toBe(true);
    expect(
      model.risks.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "headline" in item &&
          "body" in item,
      ),
    ).toBe(true);
  });

  it("caps repeated judgments, removes reader-facing snapshot jargon, and localizes evidence labels", () => {
    const repeatedClaims = Array.from({ length: 6 }, (_, index) => ({
      ...researchFileFixture.claimMatrix[0],
      id: `C${String(index + 1).padStart(2, "0")}`,
      claim: {
        en: `Company product demand claim ${index + 1}.`,
        ko: `기업 제품 수요 주장 ${index + 1}입니다.`,
      },
      sourceRefs: ["S99"],
    }));
    const file = {
      ...researchFileFixture,
      thesis: {
        en: "This macro snapshot alone is not enough.",
        ko: "이 거시 스냅샷만으로 판단하기 어렵습니다.",
      },
      claimMatrix: repeatedClaims,
      evidenceIndex: [
        ...researchFileFixture.evidenceIndex,
        {
          id: "S99",
          publisher: "U.S. Treasury",
          title: "Official Treasury yield curve",
          sourceClass: "official_macro",
          freshness: "current" as const,
        },
      ],
    };

    const model = buildResearchFileEditorialModel(file, "ko");
    const agentViewCounts = new Map<string, number>();
    for (const row of model.analysisRows)
      agentViewCounts.set(
        row.agentView,
        (agentViewCounts.get(row.agentView) ?? 0) + 1,
      );
    const serialized = JSON.stringify(model);

    expect(Math.max(...agentViewCounts.values())).toBeLessThanOrEqual(2);
    expect(serialized).not.toContain("스냅샷");
    expect(serialized).not.toContain("U.S. Treasury");
    expect(serialized).not.toContain("Official Treasury yield curve");
    expect(serialized).toContain("미국 재무부");
  });

  it("keeps the analysis and valuation registers compact without dropping their decision inputs", () => {
    const model = buildResearchFileEditorialModel(researchFileFixture, "ko");

    expect(model.analysisRows).toHaveLength(4);
    expect(
      model.analysisRows.every(
        (row) =>
          row.title.length > 0 &&
          row.agentView.length > 0 &&
          row.evidence.length > 0 &&
          row.counterpoint.length > 0 &&
          row.checkpoint.length > 0,
      ),
    ).toBe(true);
    expect(model.comparisonRows).toHaveLength(3);
    expect(
      model.scenarios.flatMap((scenario) => scenario.assumptions),
    ).not.toContain("매출 성장률 +52% · FY2027 시나리오");
    expect(
      model.scenarios.flatMap((scenario) => scenario.assumptions),
    ).toContain("매출 성장률 +52%");
  });

  it("keeps decimal-valued evidence intact when it removes a repeated sentence", () => {
    const file = {
      ...researchFileFixture,
      claimMatrix: [
        {
          ...researchFileFixture.claimMatrix[0],
          claim: {
            en: "The 10-year yield is 4.65%. The second sentence is repeated elsewhere.",
            ko: "10년물 금리는 4.65%입니다. 두 번째 문장은 다른 곳에 반복됩니다.",
          },
        },
      ],
    };

    const model = buildResearchFileEditorialModel(file, "en");

    expect(model.analysisRows[0]?.title).toContain("4.65%");
    expect(model.analysisRows[0]?.title).not.toContain("second sentence");
  });

  it("does not repeat a false current-price absence after a quote was sealed", () => {
    const file = {
      ...researchFileFixture,
      teamViews: researchFileFixture.teamViews.map((team) =>
        team.departmentId === "company"
          ? {
              ...team,
              position: {
                en: "AI demand supports growth, but the current price is unavailable.",
                ko: "AI 수요는 성장을 뒷받침하지만, 제공 근거에 현재 주가가 없어 판단할 수 없습니다.",
              },
            }
          : team,
      ),
    };

    const model = buildResearchFileEditorialModel(file, "ko");
    const serialized = JSON.stringify(model);

    expect(serialized).toContain("AI 수요는 성장을 뒷받침");
    expect(serialized).not.toContain("현재 주가가 없어");
  });
});

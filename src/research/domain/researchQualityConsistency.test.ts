import { describe, expect, it } from "vitest";
import {
  canCalculateCashFlowRatio,
  cashFlowReconciliation,
  metricsSharePeriod,
  type ResearchMetricPoint,
} from "./metricSnapshot";
import {
  enrichQuestionEvidence,
  questionEvidenceRequirements,
} from "./questionEvidenceRequirements";
import { fallbackResearchBrief, ResearchBriefSchema } from "./researchBrief";
import { DEFAULT_RESEARCH_PROFILE } from "./researchProfile";

function point(id: string, value: number): ResearchMetricPoint {
  return {
    id,
    value,
    label: { en: id, ko: id },
    unit: "USD",
    category: "financial",
    source: "insightsentry",
    definition: "provider_reported",
    period: "TTM",
    observedAt: "2026-09-11T12:00:00.000Z",
    signal: "contextual",
  };
}

describe("cross-surface research consistency", () => {
  it("does not combine issuer net-capex FCF with unreconciled provider inputs", () => {
    const values = [
      point("operating_cash_flow", 161.4e9),
      point("capital_expenditures", 169e9),
      point("free_cash_flow", -11.6e9),
    ];
    expect(cashFlowReconciliation(values)).toMatchObject({
      status: "different_definition",
      calculated: -7.6e9,
      difference: -4e9,
    });
    expect(canCalculateCashFlowRatio(values)).toBe(false);
    expect(values[2]?.value).toBe(-11.6e9);
    expect(
      cashFlowReconciliation([
        ...values.slice(0, 2),
        point("free_cash_flow", -7.6e9),
      ]),
    ).toMatchObject({ status: "reconciled" });
  });
  it("does not treat matching TTM labels as matching fiscal end dates", () => {
    const first = {
      ...point("operating_cash_flow", 10),
      periodEnd: "2026-06-30",
    };
    const second = {
      ...point("capital_expenditures", 2),
      periodEnd: "2026-03-31",
    };
    expect(metricsSharePeriod(first, second)).toBe(false);
  });
  it("requires benchmark returns rather than inferring relative strength from price", () => {
    expect(
      questionEvidenceRequirements("반도체 업종 대비 상대강도"),
    ).toContainEqual(
      expect.objectContaining({
        dimension: "relative_performance",
        searchTerms: expect.arrayContaining(["adjusted close"]),
      }),
    );
  });
  it("preserves adoption and comparison requirements even when planning falls back", () => {
    const brief = fallbackResearchBrief(
      "Copilot 고객 확장과 경쟁사 비교",
      DEFAULT_RESEARCH_PROFILE,
    );
    expect(brief.priorityDimensions).toEqual(
      expect.arrayContaining(["adoption", "moat"]),
    );
    expect(brief.cruxes.length).toBeGreaterThanOrEqual(3);
    expect(enrichQuestionEvidence(brief)).toEqual(brief);
    expect(ResearchBriefSchema.safeParse(brief).success).toBe(true);
  });
});

it("keeps cash and regulatory evidence requirements inside the planner schema", () => {
  for (const question of [
    "현금흐름 설비투자 감가상각 이익의 질",
    "로보택시 규제와 현금 유동성",
  ]) {
    const brief = fallbackResearchBrief(question, DEFAULT_RESEARCH_PROFILE);
    expect(ResearchBriefSchema.safeParse(brief).success).toBe(true);
    expect(
      brief.cruxes.flatMap((crux) => crux.searchTerms).join(" "),
    ).toContain("investment remeasurement gain");
  }
});

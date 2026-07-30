import { describe, expect, it } from "vitest";
import { recommendResearchTarget } from "./researchTarget";

describe("recommendResearchTarget", () => {
  it.each([
    ["AI 인프라 수요와 산업 성장 추세는?", "market"],
    ["제품 경쟁력과 고객 전환 비용은?", "company"],
    ["매출과 마진이 밸류에이션을 정당화하나?", "financial"],
    ["규제와 하방 리스크가 투자 논리를 무효화하나?", "risk"],
  ] as const)("recommends a focused team for %s", (question, departmentId) => {
    expect(recommendResearchTarget(question).target).toEqual({
      kind: "department",
      departmentId,
    });
  });

  it("defaults to the committee when disciplines overlap", () => {
    expect(
      recommendResearchTarget(
        "시장 수요와 제품 경쟁력, 마진 및 규제 리스크를 함께 검토해줘",
      ).target,
    ).toEqual({ kind: "committee" });
  });

  it("does not match short English signals inside other words", () => {
    expect(
      recommendResearchTarget("competitive product performance").target,
    ).toEqual({
      kind: "department",
      departmentId: "company",
    });
  });
});

import { describe, expect, it } from "vitest";
import { semanticEvidenceWindow } from "./semanticAuditStructural";

describe("semantic audit evidence window", () => {
  it("locates Korean financial evidence inside a long provider artifact", () => {
    const filler = "unrelated provider metadata ".repeat(100);
    const evidence = `${filler}영업이익률은 66.23710000935347%이며 매출은 962억2,100만 달러입니다.${filler}`;

    const selected = semanticEvidenceWindow(
      evidence,
      "최근 분기 매출 962억2,100만 달러와 영업이익률 66.24%가 확인됐다.",
    );

    expect(selected.text).toContain("영업이익률은 66.23710000935347%");
    expect(selected.start).toBeGreaterThan(0);
  });
});

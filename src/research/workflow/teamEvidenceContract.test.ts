import { describe, expect, it } from "vitest";
import {
  repairQuarterFlowLabel,
  structuredTeamEvidence,
} from "./teamEvidenceContract";

const source = "11111111-1111-4111-8111-111111111111";
const position = {
  claimId: "22222222-2222-4222-8222-222222222222",
  stance: "uncertain" as const,
  publicSummary: {
    en: "FY2026 operating cash flow was $55.441 billion.",
    ko: "FY2026 영업현금흐름은 554억4,100만 달러였다.",
  },
  evidenceArtifactIds: [source],
  decisiveMetricIds: [
    "insightsentry:provider_fundamental.cash_f_operating_activities_fq.value:5",
  ],
};
const fundamentals = {
  indicators: [
    { id: "cash_f_operating_activities_fq", period: "FQ", value: 55441000000 },
  ],
};
describe("team evidence contract", () => {
  it("retains machine-readable periods and values rather than relying on excerpt prose", () => {
    expect(
      JSON.parse(structuredTeamEvidence(JSON.stringify(fundamentals))!),
    ).toMatchObject(fundamentals);
    expect(structuredTeamEvidence("unstructured source")).toBeUndefined();
  });
  it("repairs the observed FQ-as-FY flow label only with an exact cited indicator binding", () => {
    const fixed = repairQuarterFlowLabel(position, fundamentals, source);
    expect(fixed.publicSummary.ko).toBe(
      "최근 보고 분기(FQ) 영업현금흐름은 554억4,100만 달러였다.",
    );
    expect(fixed.publicSummary.en).toBe(
      "In the latest reported quarter (FQ), operating cash flow was $55.441 billion.",
    );
    expect(fixed.evidenceArtifactIds).toEqual(position.evidenceArtifactIds);
    expect(repairQuarterFlowLabel(position, fundamentals, "unrelated")).toBe(
      position,
    );
    expect(
      repairQuarterFlowLabel(
        { ...position, decisiveMetricIds: ["unknown"] },
        fundamentals,
        source,
      ).publicSummary,
    ).toEqual(position.publicSummary);
  });
  it("does not rewrite mixed-period claims, quarter dates, or stock metrics", () => {
    const mixed = {
      ...position,
      decisiveMetricIds: [
        ...position.decisiveMetricIds,
        "insightsentry:provider_fundamental.free_cash_flow_ttm.value:6",
      ],
    };
    expect(
      repairQuarterFlowLabel(
        mixed,
        {
          indicators: [
            ...fundamentals.indicators,
            { id: "free_cash_flow_ttm", period: "TTM", value: 10 },
          ],
        },
        source,
      ),
    ).toBe(mixed);
    const dated = {
      ...position,
      publicSummary: {
        en: "In FY2026 Q4 operating cash flow grew.",
        ko: "FY2026년 6월 30일 종료 분기 영업현금흐름이다.",
      },
    };
    expect(repairQuarterFlowLabel(dated, fundamentals, source)).toBe(dated);
  });
  it("retains both negative returns and positive excess in a dated comparison", () => {
    const evidence = {
      methodology: "price returns",
      comparisons: [
        {
          symbol: "SOXX",
          kind: "sector_etf_proxy",
          windows: [
            {
              sessions: 20,
              start: "2026-08-12",
              end: "2026-09-10",
              subjectReturnPercent: -2.56,
              comparatorReturnPercent: -5.34,
              excessPercentagePoints: 2.78,
            },
          ],
        },
      ],
    };
    expect(
      JSON.parse(structuredTeamEvidence(JSON.stringify(evidence))!),
    ).toEqual(evidence);
  });
});

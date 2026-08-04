import { describe, expect, it } from "vitest";
import {
  formatPercent,
  formatSignedPercent,
  publicEvidenceLabel,
  publicMetricSource,
  publicPdfEvidenceSource,
} from "./publicPresentation";

describe("public research presentation", () => {
  it("bounds signed percentages without leaking floating-point residue", () => {
    expect(formatSignedPercent(-0.9016189290161893)).toBe("-0.9%");
    expect(formatSignedPercent(1.23456)).toBe("+1.23%");
    expect(formatSignedPercent(-0)).toBe("0%");
  });

  it("shares bounded percentage formatting with exported reports", () => {
    expect(formatPercent(63.3800149035776)).toBe("63.38%");
  });

  it("keeps evidence lineage private labels out of the public source title", () => {
    expect(
      publicEvidenceLabel(
        "InsightSentry via RapidAPI",
        "insightsentry · quote",
        "ko",
      ),
    ).toEqual({ publisher: "시장 근거", title: "현재 시장 스냅샷" });
    expect(
      JSON.stringify(
        publicEvidenceLabel(
          "InsightSentry via RapidAPI",
          "insightsentry · fundamentals",
          "en",
        ),
      ),
    ).not.toMatch(/insightsentry|rapidapi|licens/iu);
  });

  it("maps provider metric provenance to a neutral visible label", () => {
    expect(publicMetricSource("insightsentry", "ko")).toBe("시장 근거");
    expect(publicMetricSource("SEC filing", "en")).toBe("SEC filing");
  });

  it("serializes private and internal PDF evidence as reader-facing labels", () => {
    expect(
      publicPdfEvidenceSource(
        {
          publisher: "InsightSentry via RapidAPI",
          title: "insightsentry:quote",
          sourceClass: "insightsentry_rapidapi",
          url: "https://insightsentry.com/quote/NVDA",
        },
        "en",
      ),
    ).toEqual({
      publisher: "Market evidence",
      title: "Current market snapshot",
    });
    expect(
      publicPdfEvidenceSource(
        {
          publisher: "company_competition",
          title: "memo:company_competition",
          sourceClass: "accepted_agent_artifact",
        },
        "ko",
      ),
    ).toEqual({ publisher: "팀 리서치", title: "분석 기록" });
  });
});

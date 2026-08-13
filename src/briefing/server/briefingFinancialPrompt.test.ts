import { describe, expect, it } from "vitest";
import type { BriefingSourceSnapshot } from "../domain/contracts";
import { fallbackDecisionChecks } from "./briefingFallbackChecks";
import { fallbackAgentViews } from "./briefingFallbackViews";
import { briefingPrompt } from "./briefingPrompt";

function snapshot(excerpt: string): BriefingSourceSnapshot {
  return {
    symbol: "JPM",
    company: "JPMorgan Chase & Co.",
    providerCode: "NYSE:JPM",
    marketDate: "2026-08-11",
    cutoffAt: "2026-08-11T13:00:00.000Z",
    coverageStart: "2026-08-10T13:00:00.000Z",
    quote: { value: 280, marketState: "PRE" },
    signals: [],
    upcomingEvents: [
      {
        name: "JPM earnings",
        scheduledAt: "2026-10-13T11:00:00.000Z",
        whyItMatters: "Tests the supplied company metrics.",
        certainty: "estimated",
      },
    ],
    fundamentals: { total_revenue_ttm: 180_000_000_000 },
    earnings: {
      latestReportAt: "2026-07-14T11:00:00.000Z",
      epsActual: 5.2,
      epsForecast: 4.9,
      nextReportAt: "2026-10-13T11:00:00.000Z",
      nextEpsForecast: 4.8,
    },
    backgroundFinancialContext: {
      documents: [
        {
          id: "10-q",
          category: "quarterly",
          title: "Quarterly filing",
          reportedAt: "2026-07-14T11:00:00.000Z",
          publishedAt: "2026-07-14T11:00:00.000Z",
          excerpt,
        },
      ],
      epsComparison: {
        availability: "available",
        basis: "same_report",
        actual: 5.2,
        forecast: 4.9,
      },
      oneOffInterpretation: "unavailable",
    },
    sources: [],
    limitations: [],
  };
}

function promptPayload(value: BriefingSourceSnapshot): {
  readonly snapshot: Record<string, unknown>;
} {
  const prompt = briefingPrompt({
    locale: "en",
    snapshot: value,
    signals: [],
    previous: undefined,
  });
  return JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2));
}

describe("briefing financial evidence", () => {
  it("routes bank metrics only when supplied", () => {
    // Given
    const bank = snapshot(
      "Net interest income rose while credit costs remained stable.",
    );
    const generic = snapshot(
      "Revenue rose while operating expenses remained stable.",
    );

    // When
    const bankOutput = JSON.stringify([
      ...fallbackAgentViews("en", bank, []),
      ...fallbackDecisionChecks("en", bank, []),
    ]);
    const genericOutput = JSON.stringify([
      ...fallbackAgentViews("en", generic, []),
      ...fallbackDecisionChecks("en", generic, []),
    ]);

    // Then
    expect(bankOutput.toLowerCase()).toContain("net interest income");
    expect(genericOutput.toLowerCase()).not.toMatch(
      /net interest income|credit costs|\breserves\b|cet1|rotce/,
    );
  });

  it("localizes exact company metrics without mixed Korean prose", () => {
    // Given
    const bank = snapshot(
      "Net interest income rose while credit costs remained stable.",
    );
    const generic = snapshot(
      "Revenue rose while operating expenses remained stable.",
    );

    // When
    const output = JSON.stringify([
      ...fallbackAgentViews("ko", bank, []),
      ...fallbackDecisionChecks("ko", bank, []),
    ]);
    const genericOutput = JSON.stringify([
      ...fallbackAgentViews("ko", generic, []),
      ...fallbackDecisionChecks("ko", generic, []),
    ]);

    // Then
    expect(output).toContain("순이자이익");
    expect(output).not.toMatch(/net interest income|credit costs/iu);
    expect(genericOutput).not.toMatch(/순이자이익|신용비용|대손충당금/iu);
  });

  it("serializes latest and next report evidence as non-comparable groups", () => {
    // Given
    const evidence = snapshot("Revenue rose.");

    // When
    const payload = promptPayload(evidence);

    // Then
    expect(payload.snapshot).toMatchObject({
      earningsEvidence: {
        latestResult: {
          reportAt: "2026-07-14T11:00:00.000Z",
          epsActual: 5.2,
          epsForecast: 4.9,
        },
        nextReport: { reportAt: "2026-10-13T11:00:00.000Z", epsForecast: 4.8 },
        comparison: "different_reports_not_comparable",
        oneOffInterpretation: "unavailable",
      },
    });
  });

  it("keeps latest actual and next forecast period-safe in fallback prose", () => {
    // Given
    const evidence = snapshot("Revenue rose.");

    // When
    const financial = fallbackAgentViews("en", evidence, []).find(
      (view) => view.agent === "financial",
    );

    // Then
    expect(financial?.headline).toContain("latest EPS 5.20 vs 4.90 consensus");
    expect(financial?.headline).not.toContain("4.80");
    expect(financial?.detail).toContain("next-report EPS consensus 4.80");
  });
});

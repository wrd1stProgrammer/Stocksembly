import { describe, expect, it } from "vitest";
import type {
  BriefingDecisionCheck,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import { sourceBackedDecisionChecks } from "./briefingDecisionPolicy";
import { fallbackDecisionChecks } from "./briefingFallbackChecks";

function requiredAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Missing fixture at index ${index}`);
  }
  return value;
}

function snapshot(
  symbol: string,
  certainty: "confirmed" | "estimated",
): BriefingSourceSnapshot {
  return {
    symbol,
    company: `${symbol} Corporation`,
    providerCode: `NASDAQ:${symbol}`,
    marketDate: "2026-08-11",
    cutoffAt: "2026-08-11T13:00:00.000Z",
    coverageStart: "2026-08-10T13:00:00.000Z",
    quote: { value: 200, marketState: "PRE" },
    signals: [],
    upcomingEvents: [
      {
        name: `${symbol} earnings`,
        scheduledAt: "2026-10-21T20:00:00.000Z",
        whyItMatters: "Tests the current next-report EPS consensus.",
        certainty,
      },
    ],
    fundamentals: {},
    earnings: {
      nextReportAt: "2026-10-21T20:00:00.000Z",
      nextReportCertainty: certainty,
      nextEpsForecast: 2.5,
    },
    ...(symbol === "JPM"
      ? {
          backgroundFinancialContext: {
            documents: [
              {
                id: "jpm-10q",
                category: "quarterly",
                title: "JPM quarterly filing",
                reportedAt: "2026-07-15T11:00:00.000Z",
                publishedAt: "2026-07-15T11:00:00.000Z",
                excerpt: "Net interest income increased year over year.",
              },
            ],
            epsComparison: {
              availability: "unavailable" as const,
              reason: "missing_actual" as const,
            },
            oneOffInterpretation: "unavailable" as const,
          },
        }
      : {}),
    marketReference: { previousHigh: 205, previousLow: 195 },
    technicalReference: {
      timeframe: "4h",
      observedAt: "2026-08-11T13:00:00.000Z",
      barCount: 30,
      trend: "bullish",
      rsi14: 67.2,
      support: 195,
      resistance: 205,
    },
    sources: [],
    limitations: [],
  };
}

function overlappingCatalyst(): BriefingDecisionCheck {
  return {
    horizon: "next_catalyst",
    title: "Does growth defend expectations?",
    timing: "2026-10-21",
    metric: "Revenue or margin versus EPS forecast 2.50",
    confirmation: "Revenue or margin holds.",
    ifConfirmed: "Both growth and margin support the case.",
    ifUnclear: "One metric is mixed.",
    ifFailed: "Either metric weakens.",
  };
}

describe("deterministic catalyst decision policy", () => {
  it("forces exact exhaustive EPS states over overlapping model catalysts", () => {
    // Given
    for (const symbol of ["AAPL", "MSFT", "AMZN", "JPM"]) {
      const evidence = snapshot(symbol, "confirmed");
      const fallback = fallbackDecisionChecks("en", evidence, []);
      const today = {
        ...requiredAt(fallback, 0),
        title: `${symbol} current price range`,
      };

      // When
      const selected = sourceBackedDecisionChecks({
        snapshot: evidence,
        events: evidence.upcomingEvents,
        model: [today, overlappingCatalyst()],
        fallback,
      });
      const catalyst = selected.find(
        (check) => check.horizon === "next_catalyst",
      );

      // Then
      expect(selected).toEqual(fallback);
      expect(selected.some((check) => check.title === today.title)).toBe(false);
      expect(catalyst?.confirmation).toContain("EPS ≥ 2.50");
      expect(catalyst?.metric).toContain(
        "current next-report EPS consensus 2.50",
      );
      expect(catalyst?.ifUnclear).toContain("unavailable or not yet reported");
      expect(catalyst?.ifFailed).toContain("EPS < 2.50");
      expect(JSON.stringify(catalyst)).not.toMatch(
        /revenue or margin|both growth/iu,
      );
      if (symbol === "JPM") {
        expect(catalyst?.metric).toContain(
          "Secondary watch: net interest income",
        );
        expect(`${catalyst?.confirmation} ${catalyst?.ifFailed}`).not.toContain(
          "net interest income",
        );
      }
    }
  });

  it("qualifies estimated timing and keeps confirmed timing unqualified", () => {
    // Given
    const confirmed = snapshot("NVDA", "confirmed");
    const estimated = snapshot("TSLA", "estimated");

    // When
    const nvda = fallbackDecisionChecks("en", confirmed, [])[1];
    const tsla = fallbackDecisionChecks("ko", estimated, [])[1];

    // Then
    expect(nvda?.timing).toBe("2026-10-21");
    expect(tsla?.timing).toBe("2026-10-21 (예상)");
    expect(JSON.stringify(tsla)).not.toMatch(/earnings/iu);
    expect(tsla?.confirmation).toContain("EPS ≥ 2.50");
    expect(tsla?.metric).toContain("현재 다음 보고서 EPS 컨센서스 2.50");
    expect(tsla?.ifFailed).toContain("EPS < 2.50");
    expect(
      fallbackDecisionChecks("en", confirmed, [])[0]?.metric,
    ).not.toContain("RSI");
  });
});

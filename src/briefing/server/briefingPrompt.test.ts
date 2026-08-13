import { describe, expect, it } from "vitest";
import type { BriefingSourceSnapshot } from "../domain/contracts";
import { briefingPrompt } from "./briefingPrompt";

describe("briefing prompt financial context serialization", () => {
  it("serializes bounded background context without raw documents", () => {
    const snapshot: BriefingSourceSnapshot = {
      symbol: "JPM",
      company: "JPMorgan Chase & Co.",
      providerCode: "NYSE:JPM",
      marketDate: "2026-08-10",
      cutoffAt: "2026-08-10T12:00:00.000Z",
      coverageStart: "2026-08-09T12:00:00.000Z",
      quote: {},
      signals: [],
      upcomingEvents: [],
      fundamentals: {},
      backgroundFinancialContext: {
        documents: [
          {
            id: "jpm-2025-10k",
            category: "annual",
            title: "JPMorgan Chase 2025 annual report",
            reportedAt: "2025-12-31T00:00:00.000Z",
            publishedAt: "2026-02-15T14:00:00.000Z",
            excerpt: "Bounded official context",
          },
        ],
        epsComparison: {
          availability: "unavailable",
          reason: "missing_same_report_forecast",
        },
        oneOffInterpretation: "unavailable",
      },
      sources: [],
      limitations: [],
    };

    const prompt = briefingPrompt({
      locale: "en",
      snapshot,
      signals: [],
      previous: undefined,
    });
    const payload = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2));

    expect(payload.snapshot.backgroundFinancialContext).toEqual(
      snapshot.backgroundFinancialContext,
    );
    expect(
      payload.snapshot.backgroundFinancialContext.documents[0],
    ).not.toHaveProperty("content");
  });

  it("keeps cross-period EPS values structurally non-comparable", () => {
    const snapshot: BriefingSourceSnapshot = {
      symbol: "AMZN",
      company: "Amazon.com, Inc.",
      providerCode: "NASDAQ:AMZN",
      marketDate: "2026-08-10",
      cutoffAt: "2026-08-10T12:00:00.000Z",
      coverageStart: "2026-08-09T12:00:00.000Z",
      quote: {},
      signals: [],
      upcomingEvents: [],
      fundamentals: {},
      earnings: { epsActual: 1.26, nextEpsForecast: 1.41 },
      backgroundFinancialContext: {
        documents: [],
        epsComparison: {
          availability: "unavailable",
          reason: "missing_same_report_forecast",
        },
        oneOffInterpretation: "unavailable",
      },
      sources: [],
      limitations: [],
    };

    const prompt = briefingPrompt({
      locale: "en",
      snapshot,
      signals: [],
      previous: undefined,
    });
    const payload = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2));

    expect(payload.snapshot.backgroundFinancialContext.epsComparison).toEqual({
      availability: "unavailable",
      reason: "missing_same_report_forecast",
    });
    expect(
      payload.snapshot.backgroundFinancialContext.oneOffInterpretation,
    ).toBe("unavailable");
  });

  it("serializes only decision-useful technical price fields", () => {
    // Given
    const snapshot: BriefingSourceSnapshot = {
      symbol: "MSFT",
      company: "Microsoft Corporation",
      providerCode: "NASDAQ:MSFT",
      marketDate: "2026-08-11",
      cutoffAt: "2026-08-11T12:00:00.000Z",
      coverageStart: "2026-08-10T12:00:00.000Z",
      quote: {},
      signals: [],
      upcomingEvents: [],
      fundamentals: {},
      technicalReference: {
        timeframe: "4h",
        observedAt: "2026-08-11T12:00:00.000Z",
        barCount: 20,
        trend: "bullish",
        sma20: 509.91,
        sma50: 490.11,
        rsi14: 78.43,
        atr14: 8.2,
        volumeRatio20: 1.62,
        support: 500.12,
        resistance: 520.34,
      },
      sources: [],
      limitations: [],
    };

    // When
    const prompt = briefingPrompt({
      locale: "ko",
      snapshot,
      signals: [],
      previous: undefined,
    });
    const payload = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2));

    // Then
    expect(payload.snapshot.technicalReference).toEqual({
      timeframe: "4h",
      trend: "bullish",
      support: 500.12,
      resistance: 520.34,
    });
    expect(payload.snapshot.technicalReference).not.toHaveProperty("rsi14");
    expect(payload.snapshot.technicalReference).not.toHaveProperty(
      "volumeRatio20",
    );
  });
});

import { describe, expect, it } from "vitest";
import type {
  BriefingEditionPayload,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import { novelBriefingSignals } from "./briefingSignalPolicy";

const priceSignal: BriefingSignal = {
  id: "price:2026-08-11",
  kind: "price",
  direction: "positive",
  title: "Price update",
  detail: "The current quote is available for context.",
  investmentMeaning: "Only a supplied boundary crossing is a new event.",
  occurredAt: "2026-08-11T14:00:00.000Z",
};

function snapshot(
  symbol: string,
  value: number,
  boundaries: boolean,
): BriefingSourceSnapshot {
  return {
    symbol,
    company: `${symbol} Inc.`,
    providerCode: `NASDAQ:${symbol}`,
    marketDate: "2026-08-11",
    cutoffAt: "2026-08-11T14:00:00.000Z",
    coverageStart: "2026-08-11T13:00:00.000Z",
    quote: { value },
    signals: [priceSignal],
    upcomingEvents: [],
    fundamentals: {},
    ...(boundaries
      ? {
          marketReference: { previousLow: 95, previousHigh: 105 },
          technicalReference: {
            timeframe: "4h",
            observedAt: "2026-08-11T12:00:00.000Z",
            barCount: 20,
            trend: "mixed",
            support: 90,
            resistance: 110,
          },
        }
      : {}),
    sources: [],
    limitations: [],
  };
}

function previous(symbol: string, value: number): BriefingEditionPayload {
  return {
    schemaVersion: 1,
    symbol,
    company: `${symbol} Inc.`,
    locale: "en",
    marketDate: "2026-08-11",
    generatedAt: "2026-08-11T13:00:00.000Z",
    cutoffAt: "2026-08-11T13:00:00.000Z",
    coverageStart: "2026-08-10T13:00:00.000Z",
    status: "ready",
    attention: "low",
    headline: "Previous briefing",
    summary: "Previous briefing summary with sufficient source context.",
    price: { value },
    materialChanges: [],
    agentViews: [],
    bullCase: "Previous upside case.",
    bearCase: "Previous downside case.",
    upcomingEvents: [],
    todayChecks: [],
    sources: [],
    limitations: [],
  };
}

describe("briefing price novelty", () => {
  it.each([
    ["AAPL", 101, 103],
    ["NVDA", 97, 99],
  ])(
    "suppresses price state without a supplied reference crossing for %s",
    (symbol, priorValue, currentValue) => {
      // Given
      const current = snapshot(symbol, currentValue, true);

      // When
      const novel = novelBriefingSignals(current, previous(symbol, priorValue));

      // Then
      expect(current.quote.value).toBe(currentValue);
      expect(novel).toEqual([]);
    },
  );

  it.each([
    ["previous low", 96, 94],
    ["previous high", 104, 106],
    ["technical support", 91, 89],
    ["technical resistance", 109, 111],
  ])("keeps one price signal after crossing %s", (_name, prior, current) => {
    // Given
    const currentSnapshot = snapshot("AAPL", current, true);

    // When
    const novel = novelBriefingSignals(
      currentSnapshot,
      previous("AAPL", prior),
    );

    // Then
    expect(novel).toEqual([priceSignal]);
  });

  it("treats a price without supplied boundaries as contextual only", () => {
    // Given
    const current = snapshot("NVDA", 120, false);

    // When
    const novel = novelBriefingSignals(current, previous("NVDA", 100));

    // Then
    expect(current.quote.value).toBe(120);
    expect(novel).toEqual([]);
  });

  it("preserves exact-id and similarity filtering for non-price signals", () => {
    // Given
    const priorSignal = {
      ...priceSignal,
      id: "news:known",
      kind: "company" as const,
      title: "Apple expands supplier agreement",
      detail: "The supplier agreement expands current production capacity.",
    };
    const unrelated = {
      ...priorSignal,
      id: "news:new",
      title: "Apple announces a new capital return",
      detail: "The board authorized a larger source-backed capital return.",
    };
    const current = {
      ...snapshot("AAPL", 100, true),
      signals: [priorSignal, { ...priorSignal, id: "news:similar" }, unrelated],
    };
    const prior = {
      ...previous("AAPL", 100),
      materialChanges: [priorSignal],
    };

    // When
    const novel = novelBriefingSignals(current, prior);

    // Then
    expect(novel).toEqual([unrelated]);
  });
});

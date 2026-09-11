import { describe, expect, it } from "vitest";
import type { InsightSentryBarSet } from "../server/data/insightsentry/insightSentryMarket";
import { matchedPriceReturns } from "./comparisonEvidence";

const set = (factor: number): InsightSentryBarSet => ({
  timeframe: "1d",
  coverage: {
    observedStart: "2026-01-01",
    observedEnd: "2026-01-22",
    barCount: 22,
    requestedBarCount: 22,
    partial: false,
  },
  bars: Array.from({ length: 22 }, (_, i) => ({
    timestamp: `2026-01-${String(i + 1).padStart(2, "0")}T21:00:00.000Z`,
    timeframe: "1d",
    open: 100 + i * factor,
    high: 100 + i * factor,
    low: 100 + i * factor,
    close: 100 + i * factor,
    volume: 100,
  })),
});
describe("matched comparison windows", () => {
  it("excludes the current unfinished session and uses identical endpoints", () => {
    const rows = matchedPriceReturns(set(2), set(1), "2026-01-22T16:00:00Z");
    expect(rows).toEqual([
      {
        sessions: 20,
        start: "2026-01-01",
        end: "2026-01-21",
        subjectReturnPercent: 40,
        comparatorReturnPercent: 20,
        excessPercentagePoints: 20,
      },
    ]);
  });
  it("does not substitute stale or insufficient overlap", () => {
    expect(matchedPriceReturns(set(2), set(1), "2026-02-22T16:00:00Z")).toEqual(
      [],
    );
    expect(
      matchedPriceReturns(
        set(2),
        { ...set(1), bars: set(1).bars.slice(3) },
        "2026-01-22T16:00:00Z",
      ),
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { InsightSentryBarSet } from "../../research/server/data/insightsentry/insightSentryMarket";
import { deriveBriefingMarketReference } from "./briefingCollectionPolicy";

function dailyBars(): InsightSentryBarSet {
  return {
    timeframe: "1d",
    bars: [
      {
        timestamp: "2026-08-07T20:00:00.000Z",
        timeframe: "1d",
        open: 312,
        high: 315,
        low: 310,
        close: 313.33,
        volume: 80_000_000,
      },
      {
        timestamp: "2026-08-10T16:00:00.000Z",
        timeframe: "1d",
        open: 307,
        high: 308,
        low: 304,
        close: 305.54,
        volume: 45_000_000,
      },
    ],
    coverage: {
      observedStart: "2026-08-07T20:00:00.000Z",
      observedEnd: "2026-08-10T16:00:00.000Z",
      barCount: 2,
      requestedBarCount: 390,
      partial: false,
    },
  };
}

describe("briefing market reference", () => {
  it("uses the last completed session before the briefing market date", () => {
    const reference = deriveBriefingMarketReference(
      dailyBars(),
      "2026-08-10",
      "2026-08-10T16:42:00.000Z",
      { value: 305.54, marketState: "OPEN" },
    );

    expect(reference).toMatchObject({
      previousClose: 313.33,
      previousHigh: 315,
      previousLow: 310,
    });
  });
});

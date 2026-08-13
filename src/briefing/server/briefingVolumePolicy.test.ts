import { describe, expect, it } from "vitest";
import type { InsightSentryBarSet } from "../../research/server/data/insightsentry/insightSentryMarket";
import type { BriefingWatchlistItem } from "../domain/contracts";
import type { BriefingCollectorResponses } from "./briefingCollectorClients";
import { mapBriefingMarket } from "./briefingCollectorMarket";

const item: BriefingWatchlistItem = {
  symbol: "AMZN",
  providerCode: "NASDAQ:AMZN",
  company: "Amazon.com, Inc.",
  exchange: "NASDAQ",
  position: 0,
  createdAt: "2026-08-10T00:00:00.000Z",
};
const cutoffAt = "2026-08-11T16:00:00.000Z";

function fulfilled<T>(value: T): PromiseFulfilledResult<T> {
  return { status: "fulfilled", value };
}

function rejected(): PromiseRejectedResult {
  return { status: "rejected", reason: new TypeError("fixture unavailable") };
}

function fourHourBars(input: {
  readonly count: number;
  readonly partial: boolean;
  readonly latestStartAt?: string;
}): InsightSentryBarSet {
  const latestStartAt = input.latestStartAt ?? "2026-08-11T12:00:00.000Z";
  const firstStart =
    Date.parse(latestStartAt) - (input.count - 1) * 4 * 60 * 60 * 1_000;
  const bars = Array.from({ length: input.count }, (_, index) => ({
    timestamp: new Date(firstStart + index * 4 * 60 * 60 * 1_000).toISOString(),
    timeframe: "4h" as const,
    open: 100 + index,
    high: 103 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1_000 + index * 10,
  }));
  const first = bars[0];
  const last = bars.at(-1);
  if (first === undefined || last === undefined)
    throw new TypeError("fixture bars missing");
  return {
    timeframe: "4h",
    bars,
    coverage: {
      observedStart: first.timestamp,
      observedEnd: last.timestamp,
      barCount: bars.length,
      requestedBarCount: 390,
      partial: input.partial,
    },
  };
}

function marketResponses(
  fourHour: InsightSentryBarSet,
): BriefingCollectorResponses {
  return {
    quote: rejected(),
    dailyBars: rejected(),
    fourHourBars: fulfilled(fourHour),
    companyInfo: rejected(),
    news: rejected(),
    documents: rejected(),
    calendar: rejected(),
    fundamentals: rejected(),
  };
}

function technicalFor(fourHour: InsightSentryBarSet, at = cutoffAt) {
  return mapBriefingMarket({
    responses: marketResponses(fourHour),
    item,
    marketDate: "2026-08-11",
    cutoffAt: at,
  }).technicalReference;
}

function technicalFields(technical: ReturnType<typeof technicalFor>) {
  return technical === undefined
    ? undefined
    : {
        trend: technical.trend,
        support: technical.support,
        resistance: technical.resistance,
      };
}

describe("briefing volume policy", () => {
  it("omits partial fewer-than-20 and unclosed volume ratios", () => {
    const partial = technicalFor(fourHourBars({ count: 20, partial: true }));
    const fewerThanTwenty = technicalFor(
      fourHourBars({ count: 19, partial: false }),
    );
    const unclosed = technicalFor(
      fourHourBars({
        count: 20,
        partial: false,
        latestStartAt: "2026-08-11T12:00:00.000Z",
      }),
      "2026-08-11T15:59:59.999Z",
    );

    expect({
      partial: technicalFields(partial),
      fewerThanTwenty: technicalFields(fewerThanTwenty),
      unclosed: technicalFields(unclosed),
    }).toEqual({
      partial: { trend: "mixed", support: 110.5, resistance: 122 },
      fewerThanTwenty: { trend: "mixed", support: 110, resistance: 121 },
      unclosed: { trend: "mixed", support: 110.5, resistance: 122 },
    });
    expect(
      [partial, fewerThanTwenty, unclosed].map(
        (technical) =>
          technical !== undefined && Object.hasOwn(technical, "volumeRatio20"),
      ),
    ).toEqual([false, false, false]);
  });

  it("exposes the ratio for twenty complete bars with complete coverage", () => {
    const technical = technicalFor(fourHourBars({ count: 20, partial: false }));

    expect(technical).toMatchObject({
      trend: "mixed",
      support: 110.5,
      resistance: 122,
    });
    expect(technical).toHaveProperty("volumeRatio20");
  });
});

import { describe, expect, it } from "vitest";
import type { BriefingCollectorResponses } from "./briefingCollectorClients";
import { mapBriefingFinancials } from "./briefingCollectorFinancials";

function responses(earnings: {
  readonly epsActual?: number;
  readonly epsForecast?: number;
  readonly nextEpsForecast?: number;
}): BriefingCollectorResponses {
  const unavailable = {
    status: "unavailable",
    limitation: "provider_unavailable",
  } as const;
  return {
    quote: { status: "rejected", reason: new TypeError("fixture") },
    dailyBars: { status: "rejected", reason: new TypeError("fixture") },
    fourHourBars: { status: "rejected", reason: new TypeError("fixture") },
    companyInfo: {
      status: "fulfilled",
      value: { providerCode: "NASDAQ:AMZN" },
    },
    news: { status: "fulfilled", value: unavailable },
    documents: { status: "fulfilled", value: unavailable },
    calendar: {
      status: "fulfilled",
      value: {
        status: "available",
        data: {
          pitSafe: false,
          limitations: ["provider_dataset_not_point_in_time_safe"],
          providerUpdatedAt: "2026-08-10T00:00:00.000Z",
          retrievedAt: "2026-08-10T00:00:00.000Z",
          symbol: "NASDAQ:AMZN",
          windowStart: "2026-08-10T00:00:00.000Z",
          windowEnd: "2026-11-10T00:00:00.000Z",
          events: [],
          earnings,
        },
      },
    },
    fundamentals: { status: "fulfilled", value: unavailable },
  };
}

const input = {
  item: {
    symbol: "AMZN",
    providerCode: "NASDAQ:AMZN",
    company: "Amazon.com, Inc.",
    exchange: "NASDAQ" as const,
    position: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  startAt: "2026-08-09T12:00:00.000Z",
  cutoffAt: "2026-08-10T12:00:00.000Z",
};

describe("briefing financial comparison policy", () => {
  it("never compares latest actual with next forecast without a same-period basis", () => {
    const result = mapBriefingFinancials({
      ...input,
      responses: responses({ epsActual: 1.26, nextEpsForecast: 1.41 }),
    });

    expect(result.backgroundFinancialContext?.epsComparison).toEqual({
      availability: "unavailable",
      reason: "missing_same_report_forecast",
    });
    expect(result.backgroundFinancialContext?.peers).toBeUndefined();
    expect(result.limitations).not.toContain("peers");
  });

  it("permits actual versus the paired same-report forecast", () => {
    const result = mapBriefingFinancials({
      ...input,
      responses: responses({
        epsActual: 1.26,
        epsForecast: 1.12,
        nextEpsForecast: 1.41,
      }),
    });

    expect(result.backgroundFinancialContext?.epsComparison).toEqual({
      availability: "available",
      basis: "same_report",
      actual: 1.26,
      forecast: 1.12,
    });
  });
});

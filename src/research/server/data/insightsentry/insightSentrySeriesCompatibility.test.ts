import { expect, it, vi } from "vitest";
import { InsightSentryClientError } from "./insightSentryFailureClassifier";
import { createInsightSentryMarket } from "./insightSentryMarket";
import { SeriesResponseSchema } from "./insightSentryMarketSchemas";
import type { InsightSentryClient } from "./insightSentryTypes";

const payload = {
  code: "NASDAQ:NVDA",
  last_update: 1790698641499,
  bar_end: 1790711999,
  bar_type: "1D",
  series: [
    {
      time: 1790621400,
      open: 230,
      high: 232,
      low: 229,
      close: 231,
      volume: 1000,
    },
  ],
};

it("normalizes all four timeframes when provider omits optional _ct metadata", async () => {
  const client: InsightSentryClient = {
    get: async (request) => ({
      data: request.schema.parse(payload),
      cacheKey: "fixture",
      cacheStatus: "miss",
      retrievedAt: "2026-09-29T00:00:00.000Z",
      responseBytes: 100,
    }),
  };
  const frames =
    await createInsightSentryMarket(client).technicalBars("NASDAQ:NVDA");
  expect(frames.map((frame) => frame.timeframe)).toEqual([
    "1h",
    "4h",
    "1d",
    "1w",
  ]);
  expect(frames.every((frame) => frame.bars[0]?.close === 231)).toBe(true);
  expect(SeriesResponseSchema.safeParse({ ...payload, _ct: 123 }).success).toBe(
    true,
  );
  expect(
    SeriesResponseSchema.safeParse({ ...payload, _ct: "invalid" }).success,
  ).toBe(false);
  expect(
    SeriesResponseSchema.safeParse({
      ...payload,
      series: [{ ...payload.series[0], high: 228 }],
    }).success,
  ).toBe(false);
});

it("records safe timeframe errors without leaking upstream diagnostics", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const client: InsightSentryClient = {
      get: async () => {
        throw new InsightSentryClientError(
          "schema_drift",
          "never",
          {
            host: "private-host",
            endpoint: "private-endpoint",
            cacheKey: "private-key",
          },
          200,
        );
      },
    };
    await expect(
      createInsightSentryMarket(client).technicalBars("NASDAQ:NVDA"),
    ).rejects.toThrow("No technical timeframes available");
    expect(warn).toHaveBeenCalledTimes(4);
    expect(warn.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual(
      ["1h", "4h", "1d", "1w"].map((timeframe) => ({
        kind: "technical_timeframe_unavailable",
        timeframe,
        code: "schema_drift",
        status: 200,
      })),
    );
  } finally {
    warn.mockRestore();
  }
});

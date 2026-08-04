import { describe, expect, it } from "vitest";
import { createInsightSentryMarket } from "./insightSentryMarket";
import type {
  InsightSentryClient,
  InsightSentryRequest,
  InsightSentryResult,
} from "./insightSentryTypes";

const retrievedAt = "2026-07-24T00:00:00.000Z";

function fixtureClient(payloads: readonly unknown[]): {
  readonly client: InsightSentryClient;
  readonly requests: {
    readonly endpoint: string;
    readonly pathSegments: readonly string[];
    readonly parameters: Readonly<
      Record<string, string | number | boolean | readonly string[]>
    >;
    readonly adjustmentFlags?: Readonly<Record<string, boolean>>;
    readonly cacheTtlMilliseconds: number;
  }[];
} {
  let index = 0;
  const requests: {
    readonly endpoint: string;
    readonly pathSegments: readonly string[];
    readonly parameters: Readonly<
      Record<string, string | number | boolean | readonly string[]>
    >;
    readonly adjustmentFlags?: Readonly<Record<string, boolean>>;
    readonly cacheTtlMilliseconds: number;
  }[] = [];
  const client: InsightSentryClient = {
    get: <T>(
      request: InsightSentryRequest<T>,
    ): Promise<InsightSentryResult<T>> => {
      requests.push({
        endpoint: request.endpoint,
        pathSegments: request.pathSegments,
        parameters: request.parameters,
        cacheTtlMilliseconds: request.cacheTtlMilliseconds,
        ...(request.adjustmentFlags === undefined
          ? {}
          : { adjustmentFlags: request.adjustmentFlags }),
      });
      const payload = payloads[index];
      index += 1;
      return Promise.resolve({
        data: request.schema.parse(payload),
        cacheKey: `fixture-${index}`,
        cacheStatus: "miss",
        retrievedAt,
        responseBytes: 1,
      });
    },
  };
  return { client, requests };
}

describe("InsightSentry market adapter", () => {
  it("normalizes US equities, ADRs, class-share aliases, and exchange aliases", async () => {
    // Given
    const fixture = fixtureClient([
      {
        current_page: 1,
        has_more: false,
        symbols: [
          {
            name: "NVIDIA Corporation",
            code: "NASDAQ:NVDA",
            type: "common_stock",
            exchange: "NASDAQ Global Select Market",
            currency_code: "USD",
            country: "US",
            status: "active",
          },
          {
            name: "Berkshire Hathaway Inc. Class B",
            code: "NYSE:BRK.B",
            type: "common_stock",
            exchange: "New York Stock Exchange",
            currency_code: "USD",
            country: "US",
            status: "trading",
          },
          {
            name: "Alibaba Group Holding Limited ADR",
            code: "NYSE:BABA",
            type: "depository_receipt",
            exchange: "NYSE",
            currency_code: "USD",
            country: "US",
            status: "supported",
          },
          {
            name: "Unsupported Fund",
            code: "NYSEARCA:SPY",
            type: "etf",
            exchange: "NYSE Arca",
            currency_code: "USD",
            country: "US",
          },
        ],
      },
    ]);

    // When
    const symbols = await createInsightSentryMarket(
      fixture.client,
    ).searchSymbols("nvidia");

    // Then
    expect(symbols.map(({ providerCode }) => providerCode)).toEqual([
      "NASDAQ:NVDA",
      "NYSE:BRK.B",
      "NYSE:BABA",
    ]);
    expect(symbols[1]?.aliases).toEqual(
      expect.arrayContaining(["BRK.B", "BRK-B", "BRK/B"]),
    );
    expect(fixture.requests).toContainEqual(
      expect.objectContaining({
        endpoint: "/v3/symbols/search",
        pathSegments: ["symbols", "search"],
        parameters: { query: "nvidia", type: "none", country: "US", page: 1 },
      }),
    );
  });

  it.each(["unsupported", "unknown"])(
    "fails closed when an otherwise valid US equity has provider status %s",
    async (status) => {
      // Given
      const fixture = fixtureClient([
        {
          current_page: 1,
          has_more: false,
          symbols: [
            {
              name: "Rejected Corporation",
              code: "NASDAQ:REJECT",
              type: "common_stock",
              exchange: "NASDAQ",
              currency_code: "USD",
              country: "US",
              status,
            },
          ],
        },
      ]);

      // When
      const symbols = await createInsightSentryMarket(
        fixture.client,
      ).searchSymbols("rejected");

      // Then
      expect(symbols).toEqual([]);
    },
  );

  it("uses exact price flags and returns unique monotonic labelled partial coverage", async () => {
    // Given
    const bars = {
      code: "NASDAQ:NVDA",
      last_update: 1_753_315_200_000,
      _ct: 1_753_315_200_000,
      bar_type: "1h",
      series: [
        {
          time: 1_753_308_000,
          open: 171,
          high: 173,
          low: 170,
          close: 172,
          volume: 8,
        },
        {
          time: 1_753_304_400,
          open: 170,
          high: 172,
          low: 169,
          close: 171,
          volume: 7,
        },
        {
          time: 1_753_308_000,
          open: 171,
          high: 173,
          low: 170,
          close: 172,
          volume: 8,
        },
      ],
    };
    const fixture = fixtureClient([
      bars,
      { ...bars, bar_type: "4h", series: bars.series.slice(0, 2) },
      { ...bars, bar_type: "day", series: bars.series.slice(0, 2) },
    ]);

    // When
    const result = await createInsightSentryMarket(
      fixture.client,
    ).technicalBars("NASDAQ:NVDA");

    // Then
    expect(result.map(({ timeframe }) => timeframe)).toEqual([
      "1h",
      "4h",
      "1d",
    ]);
    expect(result[0]?.bars.map(({ timestamp }) => timestamp)).toEqual([
      "2025-07-23T21:00:00.000Z",
      "2025-07-23T22:00:00.000Z",
    ]);
    expect(result[0]?.coverage).toEqual({
      observedStart: "2025-07-23T21:00:00.000Z",
      observedEnd: "2025-07-23T22:00:00.000Z",
      barCount: 2,
      requestedBarCount: 390,
      partial: true,
    });
    expect(result[2]?.coverage.requestedBarCount).toBe(1_000);
    expect(fixture.requests).toHaveLength(3);
    for (const interval of [1, 4]) {
      expect(fixture.requests).toContainEqual(
        expect.objectContaining({
          endpoint: "/v3/symbols/{symbol}/series",
          pathSegments: ["symbols", "NASDAQ:NVDA", "series"],
          parameters: {
            bar_type: "hour",
            bar_interval: interval,
            dp: 390,
          },
          adjustmentFlags: {
            split: true,
            dadj: false,
            badj: false,
            extended: false,
            long_poll: false,
          },
        }),
      );
    }
    expect(fixture.requests).toContainEqual(
      expect.objectContaining({
        endpoint: "/v3/symbols/{symbol}/series",
        pathSegments: ["symbols", "NASDAQ:NVDA", "series"],
        parameters: {
          bar_type: "day",
          bar_interval: 1,
          dp: 1_000,
        },
      }),
    );
  });

  it("uses a six-hour durable cache window for comparator daily history", async () => {
    const fixture = fixtureClient([
      {
        code: "NASDAQ:MSFT",
        last_update: 1_753_315_200_000,
        _ct: 1_753_315_200_000,
        bar_type: "day",
        series: [
          {
            time: 1_753_304_400,
            open: 500,
            high: 505,
            low: 498,
            close: 503,
            volume: 10_000,
          },
        ],
      },
    ]);

    await createInsightSentryMarket(fixture.client).comparisonDailyBars(
      "NASDAQ:MSFT",
    );

    expect(fixture.requests).toEqual([
      expect.objectContaining({
        endpoint: "/v3/symbols/{symbol}/series",
        pathSegments: ["symbols", "NASDAQ:MSFT", "series"],
        parameters: {
          bar_type: "day",
          bar_interval: 1,
          dp: 1_000,
        },
        cacheTtlMilliseconds: 6 * 60 * 60 * 1_000,
      }),
    ]);
  });

  it("fails closed when a bar contains a non-finite or invalid OHLCV value", async () => {
    // Given
    const fixture = fixtureClient([
      {
        code: "NASDAQ:NVDA",
        last_update: 1_753_315_200_000,
        _ct: 1_753_315_200_000,
        bar_type: "1h",
        series: [
          {
            time: 1_753_304_400,
            open: 170,
            high: 169,
            low: 168,
            close: 171,
            volume: 7,
          },
        ],
      },
      {
        code: "NASDAQ:NVDA",
        last_update: 1_753_315_200_000,
        _ct: 1_753_315_200_000,
        bar_type: "4h",
        series: [
          {
            time: 1_753_304_400,
            open: 170,
            high: 172,
            low: 168,
            close: 171,
            volume: 7,
          },
        ],
      },
      {
        code: "NASDAQ:NVDA",
        last_update: 1_753_315_200_000,
        _ct: 1_753_315_200_000,
        bar_type: "day",
        series: [
          {
            time: 1_753_304_400,
            open: 170,
            high: 172,
            low: 168,
            close: 171,
            volume: 7,
          },
        ],
      },
    ]);

    // When
    const action = createInsightSentryMarket(fixture.client).technicalBars(
      "NASDAQ:NVDA",
    );

    // Then
    await expect(action).rejects.toThrow("invalid OHLC price ordering");
    expect(fixture.requests).toHaveLength(3);
  });

  it("caches company info for 30 days, actions for 7 days, and reports quote market state", async () => {
    // Given
    const info = {
      code: "NASDAQ:NVDA",
      name: "NVIDIA Corporation",
      type: "common_stock",
      exchange: "NASDAQ",
      currency_code: "USD",
      status: "CLOSED",
      splits: [{ time: 1_717_977_600, factor: 10 }],
    };
    const fixture = fixtureClient([
      info,
      info,
      {
        total_items: 1,
        data: [
          {
            code: "NASDAQ:NVDA",
            status: "PRE",
            lp_time: 1_753_315_200,
            last_price: 172,
            currency_code: "USD",
          },
        ],
      },
    ]);
    const market = createInsightSentryMarket(fixture.client);

    // When
    const company = await market.companyInfo("NASDAQ:NVDA");
    const actions = await market.corporateActions("NASDAQ:NVDA");
    const quote = await market.quote("NASDAQ:NVDA");

    // Then
    expect(company).toMatchObject({
      providerCode: "NASDAQ:NVDA",
      company: "NVIDIA Corporation",
    });
    expect(actions).toEqual([
      { occurredAt: "2024-06-10T00:00:00.000Z", splitFactor: 10 },
    ]);
    expect(quote).toMatchObject({
      providerCode: "NASDAQ:NVDA",
      marketState: "PRE",
      lastPrice: 172,
    });
    expect(
      fixture.requests.map(({ cacheTtlMilliseconds }) => cacheTtlMilliseconds),
    ).toEqual([30 * 24 * 60 * 60 * 1_000, 7 * 24 * 60 * 60 * 1_000, 15_000]);
    expect(fixture.requests[2]?.adjustmentFlags).toEqual({
      split: true,
      dadj: false,
      badj: false,
      extended: false,
      long_poll: false,
    });
  });
});

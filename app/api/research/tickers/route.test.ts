import { describe, expect, it, vi } from "vitest";
import type { InsightSentrySymbol } from "../../../../src/research/server/data/insightsentry/insightSentryMarket";
import { createTickerRoute } from "./route";

describe("GET /api/research/tickers", () => {
  it("returns canonical provider-backed results for company-name queries", async () => {
    // Given
    const result: InsightSentrySymbol = {
        symbol: "NVDA",
        providerCode: "NASDAQ:NVDA",
        company: "NVIDIA Corporation",
        exchange: "NASDAQ",
        securityType: "common_stock",
        currency: "USD",
        status: "active",
        aliases: ["NVDA"],
    };
    const search = vi.fn(async () => [result]);
    const get = createTickerRoute(async () => ({
      search,
      resolve: async () => "supported",
      lookup: () => ({ kind: "missing" }),
      close: () => undefined,
    }));

    // When
    const response = await get(
      new Request("http://localhost/api/research/tickers?q=nvidia"),
    );

    // Then
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tickers: [
        {
          symbol: "NVDA",
          providerCode: "NASDAQ:NVDA",
          company: "NVIDIA Corporation",
          exchange: "NASDAQ",
        },
      ],
    });
  });

  it("fails closed when the catalog is unavailable", async () => {
    // Given
    const search = vi.fn(() =>
      Promise.reject(new Error("fixture unavailable")),
    );
    const get = createTickerRoute(async () => ({
      search,
      resolve: async () => "unavailable",
      lookup: () => ({ kind: "missing" }),
      close: () => undefined,
    }));

    // When
    const response = await get(
      new Request("http://localhost/api/research/tickers?q=NVDA"),
    );

    // Then
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "TICKER_CATALOG_UNAVAILABLE" },
    });
  });
});

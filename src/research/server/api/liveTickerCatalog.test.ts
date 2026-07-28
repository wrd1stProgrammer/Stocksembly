import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { InsightSentryMarket } from "../data/insightsentry/insightSentryMarket";
import { createInsightSentryMarket } from "../data/insightsentry/insightSentryMarket";
import type {
  InsightSentryClient,
  InsightSentryRequest,
  InsightSentryResult,
} from "../data/insightsentry/insightSentryTypes";
import { createLiveTickerCatalog } from "./liveTickerCatalog";

const nvda = {
  symbol: "NVDA",
  providerCode: "NASDAQ:NVDA",
  company: "NVIDIA Corporation",
  exchange: "NASDAQ",
  securityType: "common_stock",
  currency: "USD",
  status: "active",
  aliases: ["NVDA", "NASDAQ:NVDA"],
} as const;

async function databasePath(): Promise<string> {
  return join(
    await mkdtemp(join(tmpdir(), "stocksembly-symbols-")),
    "research.sqlite",
  );
}

describe("live ticker catalog", () => {
  it("admits a contract-valid provider symbol without requiring the SEC fallback", async () => {
    // Given
    const payload = {
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
          description: "NVIDIA Corporation common stock",
        },
      ],
    };
    const client: InsightSentryClient = {
      get: <T>(
        request: InsightSentryRequest<T>,
      ): Promise<InsightSentryResult<T>> =>
        Promise.resolve({
          data: request.schema.parse(payload),
          cacheKey: "standalone-provider-contract",
          cacheStatus: "miss",
          retrievedAt: "2026-07-24T00:00:00.000Z",
          responseBytes: 1,
        }),
    };
    const resolveReference = vi.fn(async () => "unavailable" as const);
    const catalog = createLiveTickerCatalog({
      databasePath: await databasePath(),
      market: createInsightSentryMarket(client),
      searchReference: async () => [],
      resolveReference,
      now: () => "2026-07-24T00:00:00.000Z",
    });

    // When
    const resolution = await catalog.resolve("NVDA");

    // Then
    expect(resolution).toBe("supported");
    expect(resolveReference).not.toHaveBeenCalled();
    expect(catalog.lookup("NVDA")).toMatchObject({
      kind: "resolved",
      symbol: {
        providerCode: "NASDAQ:NVDA",
        status: "active",
      },
    });
    catalog.close();
  });

  it("persists a provider result and keeps it available after reopening", async () => {
    // Given
    const searchSymbols = vi.fn(async () => [nvda]);
    const market = { searchSymbols } satisfies Pick<
      InsightSentryMarket,
      "searchSymbols"
    >;
    const path = await databasePath();
    const catalog = createLiveTickerCatalog({
      databasePath: path,
      market,
      searchReference: async () => [],
      resolveReference: async () => "unsupported",
      now: () => "2026-07-24T00:00:00.000Z",
    });

    // When
    const first = await catalog.search("nvidia");
    catalog.close();
    const reopened = createLiveTickerCatalog({
      databasePath: path,
      market,
      searchReference: async () => [],
      resolveReference: async () => "unsupported",
      now: () => "2026-07-24T00:00:00.000Z",
    });
    const second = await reopened.search("nvidia");

    // Then
    expect(first[0]).toMatchObject({
      symbol: "NVDA",
      providerCode: "NASDAQ:NVDA",
    });
    expect(second).toEqual(first);
    expect(searchSymbols).toHaveBeenCalledTimes(2);
    expect(reopened.lookup("NVDA")).toMatchObject({
      kind: "resolved",
      symbol: { providerCode: "NASDAQ:NVDA" },
    });
    reopened.close();
  });

  it("refreshes a partial local match so company-name search is not capped by cache history", async () => {
    // Given
    const path = await databasePath();
    const firstCatalog = createLiveTickerCatalog({
      databasePath: path,
      market: { searchSymbols: async () => [nvda] },
      searchReference: async () => [],
      resolveReference: async () => "unsupported",
      now: () => "2026-07-24T00:00:00.000Z",
    });
    await firstCatalog.search("semiconductor");
    firstCatalog.close();
    const amd = {
      ...nvda,
      symbol: "AMD",
      providerCode: "NASDAQ:AMD",
      company: "Advanced Micro Devices, Inc.",
      aliases: ["AMD", "NASDAQ:AMD"],
    } as const;
    const searchSymbols = vi.fn(async () => [nvda, amd]);
    const catalog = createLiveTickerCatalog({
      databasePath: path,
      market: { searchSymbols },
      searchReference: async () => [],
      resolveReference: async () => "unsupported",
      now: () => "2026-07-24T00:01:00.000Z",
    });

    // When
    const results = await catalog.search("n");

    // Then
    expect(results.map((result) => result.symbol)).toEqual(["NVDA", "AMD"]);
    expect(searchSymbols).toHaveBeenCalledOnce();
    catalog.close();
  });

  it("fails closed for ambiguous aliases and unsupported or delisted results", async () => {
    // Given
    const searchSymbols = vi.fn(async () => [
      nvda,
      { ...nvda, providerCode: "NYSE:NVDA", exchange: "NYSE" as const },
      {
        ...nvda,
        symbol: "OLD",
        providerCode: "NYSE:OLD",
        status: "delisted" as const,
      },
    ]);
    const catalog = createLiveTickerCatalog({
      databasePath: await databasePath(),
      market: { searchSymbols },
      searchReference: async () => [],
      resolveReference: async () => "unsupported",
      now: () => "2026-07-24T00:00:00.000Z",
    });

    // When
    const results = await catalog.search("nvda");

    // Then
    expect(results).toEqual([]);
    expect(await catalog.resolve("NVDA")).toBe("ambiguous");
    expect(await catalog.resolve("OLD")).toBe("unsupported");
    expect(await catalog.resolve("ZZZZ")).toBe("unsupported");
    catalog.close();
  });
});

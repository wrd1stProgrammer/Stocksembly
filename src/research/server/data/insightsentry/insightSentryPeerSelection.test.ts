import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  InsightSentryClient,
  InsightSentryRequest,
  InsightSentryResult,
} from "./insightSentryClient";
import { createInsightSentryPeerScreen } from "./insightSentryPeerSelection";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function row(
  symbol: string,
  name: string,
  input: {
    readonly marketCap: number;
    readonly growth: number;
    readonly grossMargin: number;
    readonly operatingMargin: number;
  },
) {
  return {
    symbol_code: symbol,
    name,
    sector: "Electronic Technology",
    market_cap: input.marketCap,
    price_earnings_ttm: 30,
    enterprise_value_ebitda_ttm: 25,
    enterprise_value_to_revenue_ttm: 18,
    total_revenue_yoy_growth_ttm: input.growth,
    gross_margin_ttm: input.grossMargin,
    operating_margin_ttm: input.operatingMargin,
    performance_3_month_market_cap: 12,
    performance_year_market_cap: 55,
  };
}

describe("createInsightSentryPeerScreen", () => {
  it("selects filing-named competitors, retains operating comparables, and caches identities", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "stocksembly-peers-"));
    roots.push(dataRoot);
    const requests: InsightSentryRequest<unknown>[] = [];
    const payload = {
      hasNext: false,
      current_page: 1,
      total_page: 1,
      current_items: 7,
      data: [
        row("NASDAQ:NVDA", "NVIDIA Corporation", {
          marketCap: 4_600,
          growth: 70,
          grossMargin: 74,
          operatingMargin: 64,
        }),
        row("NASDAQ:AMD", "Advanced Micro Devices, Inc.", {
          marketCap: 700,
          growth: 35,
          grossMargin: 47,
          operatingMargin: 12,
        }),
        row("NASDAQ:AVGO", "Broadcom Inc.", {
          marketCap: 1_700,
          growth: 32,
          grossMargin: 66,
          operatingMargin: 44,
        }),
        row("NYSE:TSM", "Taiwan Semiconductor Manufacturing Company Ltd.", {
          marketCap: 1_800,
          growth: 35,
          grossMargin: 63,
          operatingMargin: 56,
        }),
        row("NASDAQ:MU", "Micron Technology, Inc.", {
          marketCap: 850,
          growth: 80,
          grossMargin: 70,
          operatingMargin: 58,
        }),
        row("NASDAQ:AAPL", "Apple Inc.", {
          marketCap: 5_000,
          growth: 12,
          grossMargin: 48,
          operatingMargin: 33,
        }),
        row("NASDAQ:CSCO", "Cisco Systems, Inc.", {
          marketCap: 450,
          growth: 9,
          grossMargin: 63,
          operatingMargin: 24,
        }),
      ],
    };
    const client: InsightSentryClient = {
      get: async <T>(
        request: InsightSentryRequest<T>,
      ): Promise<InsightSentryResult<T>> => {
        requests.push(request as InsightSentryRequest<unknown>);
        return {
          data: request.schema.parse(payload),
          cacheKey: "fixture",
          cacheStatus: "miss",
          retrievedAt: "2026-07-30T00:00:00.000Z",
          responseBytes: 100,
        };
      },
    };
    const screen = createInsightSentryPeerScreen({
      client,
      dataRoot,
      asOf: "2026-07-30T00:00:00.000Z",
      annualAccessionNumber: "0000000000-26-000001",
      annualText:
        "We compete directly with Advanced Micro Devices in accelerated computing. Broadcom is referenced as a market participant.",
    });

    type Result = {
      readonly selectionCache: "hit" | "miss";
      readonly subject: {
        readonly symbol: string;
      };
      readonly relativeValuation: readonly {
        readonly metric: string;
        readonly peerMedian: number;
        readonly peerCount: number;
        readonly premiumDiscountPercent?: number;
      }[];
      readonly peers: readonly {
        readonly symbol: string;
        readonly classification: "direct_competitor" | "operating_comparable";
        readonly selectionReasons: readonly string[];
        readonly selectionScore: number;
      }[];
    };
    const first = (await screen({
      symbol: "NASDAQ:NVDA",
      limit: 10,
    })) as Result;
    const second = (await screen({
      symbol: "NASDAQ:NVDA",
      limit: 10,
    })) as Result;

    expect(first.selectionCache).toBe("miss");
    expect(second.selectionCache).toBe("hit");
    expect(first.subject.symbol).toBe("NASDAQ:NVDA");
    expect(first.relativeValuation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric: "price_earnings_ttm",
          peerMedian: 30,
          peerCount: 6,
          premiumDiscountPercent: 0,
        }),
      ]),
    );
    expect(first.peers[0]).toMatchObject({
      symbol: "NASDAQ:AMD",
      classification: "direct_competitor",
    });
    expect(first.peers).toHaveLength(6);
    expect(
      first.peers.every(
        (peer) =>
          peer.selectionReasons.length > 0 &&
          peer.selectionScore >= 0 &&
          peer.selectionScore <= 1,
      ),
    ).toBe(true);
    expect(requests.every((request) => request.method === "POST")).toBe(true);
    expect(
      requests.every((request) => {
        const fields = request.requestBody?.["fields"];
        return Array.isArray(fields) && fields.includes("price_earnings_ttm");
      }),
    ).toBe(true);
  });
});

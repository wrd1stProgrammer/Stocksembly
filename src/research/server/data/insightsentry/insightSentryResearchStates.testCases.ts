import { expect, it } from "vitest";
import type { InsightSentryClient } from "./insightSentryClient";
import { InsightSentryClientError } from "./insightSentryClient";
import { createInsightSentryResearchDataAdapter } from "./insightSentryResearchData";
import {
  AS_OF,
  type CapturedRequest,
  fixtureClient,
  ROLLOUT,
} from "./insightSentryResearchData.testSupport";

export function registerInsightSentryFamilyStateCases(): void {
  it("gates families independently and limits documents peers and options", async () => {
    // Given
    const requests: CapturedRequest[] = [];
    const client = fixtureClient(
      {
        document_index: Array.from({ length: 5 }, (_, index) => ({
          id: `report:${index}`,
          category: "Report",
          reported_time: 1_721_865_600 - index,
          is_available: true,
          title: `Report ${index}`,
          is_pdf: false,
        })),
        document: {
          title: "Report",
          published_at: 1_721_865_600,
          content: "x".repeat(20_000),
        },
        options: {
          underlying_code: "NASDAQ:NVDA",
          last_update: 1_721_865_600_000,
          data: Array.from({ length: 120 }, (_, index) => ({
            code: `OPRA:NVDA${index}`,
            description: "Contract",
            expiration: "2026-08-21",
            type: index % 2 === 0 ? "CALL" : "PUT",
            status: "active",
            style: "AMERICAN",
            strike_price: String(index),
            multiplier: "100",
            size: "1",
          })),
        },
      },
      requests,
    );
    const adapter = createInsightSentryResearchDataAdapter({
      client,
      rollout: { ...ROLLOUT, calendar: false },
      classifyNews: async () => ({ classifications: [] }),
      screenPeers: async () => ({
        providerUpdatedAt: AS_OF,
        retrievedAt: AS_OF,
        sector: "Electronic Technology",
        selectorVersion: "fixture-v1",
        selectionCache: "miss",
        subject: {
          symbol: "NASDAQ:NVDA",
          name: "NVIDIA Corporation",
          sector: "Electronic Technology",
          marketCap: 4_000,
          priceEarningsTtm: 40,
        },
        relativeValuation: [
          {
            metric: "price_earnings_ttm",
            subjectValue: 40,
            peerMedian: 30,
            peerCount: 10,
            premiumDiscountPercent: 33.33,
          },
        ],
        peers: Array.from({ length: 15 }, (_, index) => ({
          symbol: `NASDAQ:P${index}`,
          name: `Peer ${index}`,
          sector: "Electronic Technology",
          classification:
            index < 3 ? "direct_competitor" : "operating_comparable",
          selectionScore: 1 - index / 20,
          selectionReasons: ["fixture comparison"],
          marketCap: 1_000 - index,
        })),
      }),
    });

    // When
    const [documents, calendar, peers, optionsWithheld, options] =
      await Promise.all([
        adapter.documents({ symbol: "NASDAQ:NVDA", asOf: AS_OF }),
        adapter.calendar({ symbol: "NASDAQ:NVDA", asOf: AS_OF }),
        adapter.peers({ symbol: "NASDAQ:NVDA" }),
        adapter.options({
          symbol: "NASDAQ:NVDA",
          asOf: AS_OF,
          entitled: false,
          needed: true,
        }),
        adapter.options({
          symbol: "NASDAQ:NVDA",
          asOf: AS_OF,
          entitled: true,
          needed: true,
        }),
      ]);

    // Then
    expect(
      documents.status === "available" && documents.data.documents,
    ).toHaveLength(3);
    expect(calendar).toEqual({
      status: "withheld",
      limitation: "rollout_disabled",
    });
    expect(peers.status === "available" && peers.data.peers).toHaveLength(10);
    expect(optionsWithheld).toEqual({
      status: "withheld",
      limitation: "not_entitled",
    });
    expect(
      options.status === "available" && options.data.contracts.length,
    ).toBeLessThanOrEqual(100);
  });

  it("maps stale unavailable and entitlement failures independently", async () => {
    // Given
    const failure = (
      code: "stale" | "server_error" | "subscription_required",
    ) =>
      ({
        get: async () => {
          throw new InsightSentryClientError(code, "never", {
            host: "fixture",
            endpoint: "fixture",
            cacheKey: "fixture",
          });
        },
      }) satisfies InsightSentryClient;

    // When
    const results = await Promise.all(
      (["stale", "server_error", "subscription_required"] as const).map(
        async (code) =>
          await createInsightSentryResearchDataAdapter({
            client: failure(code),
            rollout: ROLLOUT,
            classifyNews: async () => ({ classifications: [] }),
            screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
          }).fundamentals({
            symbol: "NASDAQ:NVDA",
            asOf: AS_OF,
            seriesIndicatorIds: [],
            periods: 12,
          }),
      ),
    );

    // Then
    expect(results.map((result) => result.status)).toEqual([
      "stale",
      "unavailable",
      "withheld",
    ]);
  });

  it("paginates options at most twice and keeps one hundred contracts", async () => {
    // Given
    const requests: CapturedRequest[] = [];
    const contracts = (offset: number) =>
      Array.from({ length: 60 }, (_, index) => ({
        code: `OPRA:NVDA${offset + index}`,
        description: "Contract",
        expiration: "2026-08-21",
        type: index % 2 === 0 ? "CALL" : "PUT",
        status: "active",
        style: "AMERICAN",
        strike_price: String(offset + index),
        multiplier: "100",
        size: "1",
      }));
    const adapter = createInsightSentryResearchDataAdapter({
      client: fixtureClient(
        {
          "options::": {
            underlying_code: "NASDAQ:NVDA",
            last_update: 1_721_865_600_000,
            next_token: "next-1",
            data: contracts(0),
          },
          "options::next-1": {
            underlying_code: "NASDAQ:NVDA",
            last_update: 1_721_865_700_000,
            data: contracts(60),
          },
        },
        requests,
      ),
      rollout: ROLLOUT,
      classifyNews: async () => ({ classifications: [] }),
      screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
    });

    // When
    const result = await adapter.options({
      symbol: "NASDAQ:NVDA",
      asOf: AS_OF,
      entitled: true,
      needed: true,
    });

    // Then
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(
      requests.filter((request) => request.endpoint === "options"),
    ).toHaveLength(2);
    expect(result.data.contracts).toHaveLength(100);
  });

  it("distinguishes provider update report and retrieval timestamps", async () => {
    // Given
    const requests: CapturedRequest[] = [];
    const reportAt = Date.parse("2026-08-01T12:00:00.000Z") / 1_000;
    const adapter = createInsightSentryResearchDataAdapter({
      client: fixtureClient(
        {
          calendar: {
            total_count: 1,
            range: "13",
            // Live calendar responses may use milliseconds even though event
            // timestamps use seconds.
            last_update: Date.parse("2026-07-24T10:00:00.000Z"),
            data: [
              {
                code: "NASDAQ:NVDA",
                name: "NVIDIA",
                earnings_release_date:
                  Date.parse("2026-05-20T12:00:00.000Z") / 1_000,
                earnings_release_next_date: reportAt,
                earnings_per_share_fq: 1.92,
                earnings_per_share_forecast_fq: 1.88,
                earnings_per_share_forecast_next_fq: 2.08,
                eps_surprise_percent_fq: 2.13,
                revenue_fq: 46_740_000_000,
                revenue_forecast_next_fq: 52_100_000_000,
              },
            ],
          },
        },
        requests,
      ),
      rollout: ROLLOUT,
      classifyNews: async () => ({ classifications: [] }),
      screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
    });

    // When
    const result = await adapter.calendar({
      symbol: "NASDAQ:NVDA",
      asOf: AS_OF,
    });

    // Then
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.data.providerUpdatedAt).toBe("2026-07-24T10:00:00.000Z");
    expect(result.data.retrievedAt).toBe(AS_OF);
    expect(result.data.events.map((event) => event.reportAt)).toContain(
      "2026-08-01T12:00:00.000Z",
    );
    expect(result.data.earnings).toMatchObject({
      epsActual: 1.92,
      epsForecast: 1.88,
      nextEpsForecast: 2.08,
      epsSurprisePercent: 2.13,
      revenueActual: 46_740_000_000,
      nextRevenueForecast: 52_100_000_000,
    });
    expect(result.data.pitSafe).toBe(false);
  });
}

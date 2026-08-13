import { describe, expect, it, vi } from "vitest";
import type { BriefingCollectorResponses } from "./briefingCollectorClients";
import { mapBriefingFinancials } from "./briefingCollectorFinancials";

const collectorDouble = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock("./briefingCollectorClients", () => ({
  createBriefingCollectorClients: vi.fn(() => collectorDouble),
}));
vi.mock("./briefingCollectorMarket", () => ({
  mapBriefingMarket: vi.fn(() => ({
    quote: {},
    priceSignals: [],
    limitations: [],
  })),
}));
vi.mock("./briefingCollectorNews", () => ({
  mapBriefingNews: vi.fn(() => ({
    signals: [],
    sources: [],
    limited: false,
  })),
}));

import { createBriefingDataCollector } from "./briefingDataCollector";

function financialResponses(): BriefingCollectorResponses {
  const unavailable = {
    status: "unavailable",
    limitation: "provider_unavailable",
  } as const;
  return {
    quote: { status: "rejected", reason: new TypeError("fixture") },
    dailyBars: { status: "rejected", reason: new TypeError("fixture") },
    fourHourBars: { status: "rejected", reason: new TypeError("fixture") },
    companyInfo: { status: "fulfilled", value: { providerCode: "NYSE:JPM" } },
    news: { status: "fulfilled", value: unavailable },
    documents: {
      status: "fulfilled",
      value: {
        status: "available",
        data: {
          pitSafe: false,
          limitations: ["provider_dataset_not_point_in_time_safe"],
          providerUpdatedAt: "2026-08-10T00:00:00.000Z",
          retrievedAt: "2026-08-10T00:00:00.000Z",
          symbol: "NYSE:JPM",
          documents: [
            {
              id: "jpm-2025-10k",
              category: "annual",
              title: "JPMorgan Chase 2025 annual report",
              reportedAt: "2025-12-31T00:00:00.000Z",
              publishedAt: "2026-02-15T14:00:00.000Z",
              content: "Official annual filing",
            },
          ],
        },
      },
    },
    calendar: { status: "fulfilled", value: unavailable },
    fundamentals: { status: "fulfilled", value: unavailable },
  };
}

describe("briefing financial document collection", () => {
  it("reuses old official documents only as bounded background", () => {
    const unavailable = {
      status: "unavailable",
      limitation: "provider_unavailable",
    } as const;
    const responses: BriefingCollectorResponses = {
      quote: { status: "rejected", reason: new TypeError("fixture") },
      dailyBars: { status: "rejected", reason: new TypeError("fixture") },
      fourHourBars: { status: "rejected", reason: new TypeError("fixture") },
      companyInfo: {
        status: "fulfilled",
        value: { providerCode: "NYSE:JPM" },
      },
      news: { status: "fulfilled", value: unavailable },
      documents: {
        status: "fulfilled",
        value: {
          status: "available",
          data: {
            pitSafe: false,
            limitations: ["provider_dataset_not_point_in_time_safe"],
            providerUpdatedAt: "2026-08-10T00:00:00.000Z",
            retrievedAt: "2026-08-10T00:00:00.000Z",
            symbol: "NYSE:JPM",
            documents: [
              {
                id: "jpm-2025-10k",
                category: "annual",
                title: "JPMorgan Chase 2025 annual report",
                reportedAt: "2025-12-31T00:00:00.000Z",
                publishedAt: "2026-02-15T14:00:00.000Z",
                content: `Official annual filing ${"x".repeat(1_000)}`,
              },
            ],
          },
        },
      },
      calendar: { status: "fulfilled", value: unavailable },
      fundamentals: { status: "fulfilled", value: unavailable },
    };

    const result = mapBriefingFinancials({
      responses,
      item: {
        symbol: "JPM",
        providerCode: "NYSE:JPM",
        company: "JPMorgan Chase & Co.",
        exchange: "NYSE",
        position: 0,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      startAt: "2026-08-09T12:00:00.000Z",
      cutoffAt: "2026-08-10T12:00:00.000Z",
      peers: {
        providerUpdatedAt: "2026-08-10T00:00:00.000Z",
        retrievedAt: "2026-08-10T00:00:00.000Z",
        symbol: "NYSE:JPM",
        sector: "Finance",
        selectorVersion: "fixture-v1",
        selectionCache: "miss",
        subject: {
          symbol: "NYSE:JPM",
          name: "JPMorgan Chase & Co.",
          sector: "Finance",
          priceEarningsTtm: 12.4,
        },
        relativeValuation: [
          {
            metric: "price_earnings_ttm",
            peerMedian: 13.2,
            peerCount: 5,
            subjectValue: 12.4,
            premiumDiscountPercent: -6.06,
          },
        ],
        peers: [],
      },
    });

    expect(result.backgroundFinancialContext?.documents).toEqual([
      expect.objectContaining({ id: "jpm-2025-10k", category: "annual" }),
    ]);
    expect(
      result.backgroundFinancialContext?.documents[0]?.excerpt.length,
    ).toBeLessThanOrEqual(480);
    expect(result.documentSignals.map((signal) => signal.id)).not.toContain(
      "document:jpm-2025-10k",
    );
    const materialChanges = result.documentSignals;
    expect(materialChanges.map((signal) => signal.id)).not.toContain(
      "document:jpm-2025-10k",
    );
    expect(result.backgroundFinancialContext?.peers).toEqual({
      sector: "Finance",
      subject: {
        symbol: "NYSE:JPM",
        name: "JPMorgan Chase & Co.",
        priceEarningsTtm: 12.4,
      },
      relativeValuation: [
        {
          metric: "price_earnings_ttm",
          peerMedian: 13.2,
          peerCount: 5,
          subjectValue: 12.4,
          premiumDiscountPercent: -6.06,
        },
      ],
    });
    expect(result.limitations).not.toContain("peers");
  });

  it("passes bounded background through the internal source snapshot", async () => {
    collectorDouble.collect.mockResolvedValueOnce(financialResponses());

    const snapshot = await createBriefingDataCollector({
      dataRoot: "/tmp/briefing-financial-fixture",
    }).collect({
      item: {
        symbol: "JPM",
        providerCode: "NYSE:JPM",
        company: "JPMorgan Chase & Co.",
        exchange: "NYSE",
        position: 0,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      marketDate: "2026-08-10",
      cutoffAt: "2026-08-10T12:00:00.000Z",
      previousEventKeys: [],
    });

    expect(snapshot.backgroundFinancialContext?.documents[0]?.id).toBe(
      "jpm-2025-10k",
    );
    expect(snapshot.signals.map((signal) => signal.id)).not.toContain(
      "document:jpm-2025-10k",
    );
  });
});

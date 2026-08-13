import { expect, it } from "vitest";
import { qualifyInsightSentryPeers } from "./qualifyInsightSentryPeers";

it("does not infer product and customer overlap from a shared broad sector", () => {
  // Given
  const peers = {
    providerUpdatedAt: "2026-07-30T00:00:00.000Z",
    sector: "Technology",
    subject: {
      symbol: "NASDAQ:SPACE",
      name: "Launch Systems",
      sector: "Technology",
      priceEarningsTtm: 40,
      revenueGrowthTtm: 30,
      operatingMarginTtm: 20,
    },
    peers: [
      {
        symbol: "NASDAQ:TELCO",
        name: "Telecom Systems",
        sector: "Technology",
        classification: "direct_competitor",
        selectionReasons: ["broad screen"],
        priceEarningsTtm: 20,
        revenueGrowthTtm: 15,
        operatingMarginTtm: 10,
      },
    ],
  };

  // When
  const result = qualifyInsightSentryPeers({
    rawPeerArtifactId: "peer-artifact",
    peers,
  });

  // Then
  expect(result).toMatchObject({
    status: "no_qualified_comparison",
    rows: [
      expect.objectContaining({
        comparatorId: "NASDAQ:TELCO",
        displayEligibility: false,
        exclusionReasons: expect.arrayContaining(["market_overlap_required"]),
      }),
    ],
  });
});

it("keeps explicitly selected companies as valuation comparators", () => {
  const peers = {
    providerUpdatedAt: "2026-07-30T00:00:00.000Z",
    sector: "Technology Services",
    subject: {
      symbol: "NASDAQ:MSFT",
      name: "Microsoft",
      sector: "Technology Services",
      priceEarningsTtm: 25,
    },
    peers: ["AAPL", "GOOGL", "AMZN"].map((symbol, index) => ({
      symbol: `NASDAQ:${symbol}`,
      name: symbol,
      sector: "Technology",
      classification: "direct_competitor" as const,
      selectionReasons: ["user-selected comparator"],
      priceEarningsTtm: 20 + index,
    })),
  };

  const result = qualifyInsightSentryPeers({
    rawPeerArtifactId: "peer-artifact",
    peers,
  });

  expect(result).toMatchObject({
    status: "qualified",
    valuation: { status: "eligible", eligibleCompanyCount: 3 },
    rows: [
      expect.objectContaining({
        role: "valuation_proxy",
        displayEligibility: true,
      }),
      expect.objectContaining({
        role: "valuation_proxy",
        displayEligibility: true,
      }),
      expect.objectContaining({
        role: "valuation_proxy",
        displayEligibility: true,
      }),
    ],
  });
});

it("qualifies a filing-verified direct competitor with aligned market metrics", () => {
  const peers = {
    providerUpdatedAt: "2026-08-10T00:00:00.000Z",
    sector: "Electronic Technology",
    subject: {
      symbol: "NASDAQ:NVDA",
      name: "NVIDIA",
      sector: "Electronic Technology",
      marketCap: 4_000,
      revenueGrowthTtm: 65,
      performance3Month: 22,
      performance1Year: 84,
    },
    peers: [
      {
        symbol: "NASDAQ:AMD",
        name: "Advanced Micro Devices",
        sector: "Electronic Technology",
        classification: "direct_competitor" as const,
        selectionReasons: [
          "issuer filing names the company near competition language",
        ],
        marketOverlapVerified: true,
        marketCap: 500,
        revenueGrowthTtm: 32,
        performance3Month: 11,
        performance1Year: 48,
      },
    ],
  };

  const result = qualifyInsightSentryPeers({
    rawPeerArtifactId: "peer-artifact",
    peers,
  });

  expect(result).toMatchObject({
    status: "qualified",
    diagnostics: {
      candidateCount: 1,
      displayEligibleCount: 1,
    },
    rows: [
      expect.objectContaining({
        comparatorId: "NASDAQ:AMD",
        role: "direct_competitor",
        displayEligibility: true,
        comparableMetricKeys: expect.arrayContaining([
          "market_cap",
          "revenue_growth_ttm",
          "performance_3_month",
          "performance_1_year",
        ]),
        exclusionReasons: [],
        rationale: expect.objectContaining({
          ko: "회사의 공식 공시에서 경쟁 관계로 확인됨",
        }),
      }),
    ],
  });
});

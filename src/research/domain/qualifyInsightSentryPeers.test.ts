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

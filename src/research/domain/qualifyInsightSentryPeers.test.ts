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

it("excludes filing-mentioned companies outside NVIDIA's industry from valuation", () => {
  const peers = {
    providerUpdatedAt: "2026-08-27T00:00:00.000Z",
    sector: "Electronic Technology",
    subject: {
      symbol: "NASDAQ:NVDA",
      name: "NVIDIA",
      sector: "Electronic Technology",
      priceEarningsTtm: 32,
      revenueGrowthTtm: 65,
      operatingMarginTtm: 61,
    },
    peers: [
      ["AMD", "Advanced Micro Devices", "Electronic Technology", 24, 32, 22],
      ["INTC", "Intel", "Electronic Technology", 30, 8, 5],
      ["AVGO", "Broadcom", "Electronic Technology", 28, 21, 46],
      ["SHIP", "Seanergy Maritime", "Transportation", 3, 18, 44],
      ["HAS", "Hasbro", "Consumer Durables", 14, 9, 12],
      ["T", "AT&T", "Communications", 7, 2, 19],
      ["KEY", "KeyCorp", "Finance", 9, 6, 31],
    ].map(([symbol, name, sector, pe, growth, margin]) => ({
      symbol: `NASDAQ:${symbol}`,
      name,
      sector,
      classification: "direct_competitor" as const,
      selectionReasons: [
        "issuer filing names the company near competition language",
      ],
      marketOverlapVerified: true,
      priceEarningsTtm: pe,
      revenueGrowthTtm: growth,
      operatingMarginTtm: margin,
    })),
  };

  const result = qualifyInsightSentryPeers({
    rawPeerArtifactId: "peer-artifact",
    peers,
  });

  expect(result?.valuation).toMatchObject({
    status: "eligible",
    eligibleCompanyCount: 3,
    peerMedian: 28,
  });
  for (const symbol of ["AMD", "INTC", "AVGO"]) {
    expect(
      result?.rows.find((row) => row.comparatorId === `NASDAQ:${symbol}`),
    ).toMatchObject({ displayEligibility: true, medianEligibility: true });
  }
  for (const symbol of ["SHIP", "HAS", "T", "KEY"]) {
    expect(
      result?.rows.find((row) => row.comparatorId === `NASDAQ:${symbol}`),
    ).toMatchObject({
      displayEligibility: false,
      medianEligibility: false,
      exclusionReasons: expect.arrayContaining(["industry_mismatch"]),
    });
  }
});

it("rejects polluted security and purpose records and omits a two-peer premium", () => {
  const qualifiedPeer = (symbol: string, pe: number) => ({
    symbol: `NASDAQ:${symbol}`,
    name: symbol,
    sector: "Semiconductors",
    classification: "direct_competitor" as const,
    selectionReasons: [
      "issuer filing names the company near competition language",
    ],
    marketOverlapVerified: true,
    priceEarningsTtm: pe,
    operatingMarginTtm: 20,
    canonicalIdentity: {
      cik: `cik-${symbol}`,
      ticker: symbol,
      exchange: "NASDAQ",
      legalName: symbol,
      title: "Common Stock",
      securityClass: "common_stock",
      sector: "Semiconductors",
      primaryProductMarket: "issuer-verified-competition:NASDAQ:SUBJ",
      primaryCustomerMarket: "issuer-verified-competition:NASDAQ:SUBJ",
    },
    securityQualification: {
      status: "eligible",
      sourcePurpose: "issuer_identity",
    },
    businessQualification: {
      status: "eligible",
      sourcePurpose: "business_overlap",
    },
    valuationQualification: {
      status: "eligible",
      sourcePurpose: "valuation_metric",
    },
  });
  const peers = {
    providerUpdatedAt: "2026-08-28T00:00:00.000Z",
    sector: "Semiconductors",
    subject: {
      symbol: "NASDAQ:SUBJ",
      name: "Subject",
      sector: "Semiconductors",
      priceEarningsTtm: 30,
      operatingMarginTtm: 25,
    },
    peers: [
      qualifiedPeer("A", 20),
      qualifiedPeer("B", 25),
      {
        ...qualifiedPeer("ETF", 12),
        sourcePurpose: "valuation_metric",
        canonicalIdentity: {
          ...qualifiedPeer("ETF", 12).canonicalIdentity,
          securityClass: "fund",
        },
        securityQualification: {
          status: "not_eligible",
          sourcePurpose: "issuer_identity",
          reason: "fund",
        },
      },
    ],
  };

  const result = qualifyInsightSentryPeers({
    rawPeerArtifactId: "peer-artifact",
    peers,
  });
  expect(result?.valuation).toEqual({
    status: "not_eligible",
    reason: "insufficient_eligible_companies",
    eligibleCompanyCount: 2,
  });
  expect(
    result?.rows.find((row) => row.comparatorId === "cik-ETF"),
  ).toMatchObject({
    displayEligibility: false,
    medianEligibility: false,
    exclusionReasons: expect.arrayContaining(["security_class_mismatch"]),
  });
});

import { describe, expect, it } from "vitest";
import { buildResearchMetricSnapshot } from "./metricSnapshot";

describe("research metric snapshot", () => {
  it("preserves the raw peer input while serializing the existing relative valuation metric", () => {
    // Given
    const peers = {
      providerUpdatedAt: "2026-07-30T00:00:00.000Z",
      subject: {},
      relativeValuation: [
        { metric: "price_earnings_ttm", premiumDiscountPercent: 12.5 },
      ],
      peers: [
        {
          symbol: "NASDAQ:PEER",
          name: "Peer Incorporated",
          sector: "Technology",
        },
      ],
    };
    const before = structuredClone(peers);

    // When
    const snapshot = buildResearchMetricSnapshot({
      asOf: "2026-07-31T00:00:00.000Z",
      peers,
    });

    // Then
    expect(snapshot?.metrics).toContainEqual(
      expect.objectContaining({
        id: "peer_premium:price_earnings_ttm",
        value: 12.5,
      }),
    );
    expect(peers).toEqual(before);
    expect(peers.peers).toHaveLength(1);
  });

  it("preserves price, fundamentals, and nested segment mix", () => {
    const snapshot = buildResearchMetricSnapshot({
      asOf: "2026-07-31T00:00:00.000Z",
      quote: {
        providerCode: "NVDA",
        lastPrice: 182.45,
        currency: "USD",
        observedAt: "2026-07-30T20:00:00.000Z",
      },
      fundamentals: {
        providerUpdatedAt: "2026-07-30T00:00:00.000Z",
        indicators: [
          { id: "revenue_one_year_growth_ttm", value: 65.5, period: "TTM" },
          {
            id: "revenue_seg_by_business_h",
            value: [
              {
                date: 2026,
                segments: [
                  { label: "Data Center", value: 100 },
                  { label: "Gaming", value: 25 },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(snapshot?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "current_price", value: 182.45 }),
        expect.objectContaining({ id: "revenue_growth", value: 65.5 }),
        expect.objectContaining({
          id: "segment_share:data_center",
          value: 80,
        }),
      ]),
    );
  });

  it("serializes qualified peer rows and median lineage from peer evidence", () => {
    // Given
    const peers = {
      providerUpdatedAt: "2026-07-30T00:00:00.000Z",
      sector: "Accelerated Computing",
      subject: {
        symbol: "NASDAQ:SUBJ",
        name: "Subject",
        sector: "Accelerated Computing",
        primaryProductMarket: "accelerated computing",
        primaryCustomerMarket: "data center operators",
        priceEarningsTtm: 40,
        revenueGrowthTtm: 30,
        operatingMarginTtm: 25,
      },
      relativeValuation: [],
      peers: [20, 30, 25].map((priceEarningsTtm, index) => ({
        symbol: `NASDAQ:PEER${index + 1}`,
        name: `Peer ${index + 1}`,
        sector: "Accelerated Computing",
        primaryProductMarket: "accelerated computing",
        primaryCustomerMarket: "data center operators",
        classification: "direct_competitor",
        selectionReasons: ["same product and customer market"],
        priceEarningsTtm,
        revenueGrowthTtm: 20,
        operatingMarginTtm: 18,
      })),
    };

    // When
    const snapshot = buildResearchMetricSnapshot({
      asOf: "2026-07-31T00:00:00.000Z",
      peers,
      peerEvidenceArtifactId: "peer-artifact-1",
    });

    // Then
    expect(snapshot?.comparatorQualification).toMatchObject({
      status: "qualified",
      rawPeerArtifactId: "peer-artifact-1",
      rawArtifactCount: 3,
      valuation: {
        status: "eligible",
        peerMedian: 25,
        eligibleCompanyCount: 3,
      },
    });
  });

  it("serializes a structured no-comparison state while retaining excluded peer count", () => {
    // Given
    const peers = {
      providerUpdatedAt: "2026-07-30T00:00:00.000Z",
      sector: "Satellite Launch",
      subject: {
        symbol: "NASDAQ:SPACE",
        name: "Space Subject",
        sector: "Satellite Launch",
        priceEarningsTtm: 40,
      },
      relativeValuation: [],
      peers: [
        {
          symbol: "NYSE:TELCO",
          name: "Telecom Peer",
          sector: "Telecommunications",
          classification: "direct_competitor",
          selectionReasons: ["broad market screen"],
          priceEarningsTtm: 15,
        },
      ],
    };

    // When
    const snapshot = buildResearchMetricSnapshot({
      asOf: "2026-07-31T00:00:00.000Z",
      peers,
      peerEvidenceArtifactId: "peer-artifact-invalid",
    });

    // Then
    expect(snapshot?.comparatorQualification).toMatchObject({
      status: "no_qualified_comparison",
      rawArtifactCount: 1,
      rows: [
        expect.objectContaining({
          displayEligibility: false,
          exclusionReasons: expect.arrayContaining([
            "market_overlap_required",
            "insufficient_aligned_metrics",
          ]),
        }),
      ],
      valuation: { status: "not_eligible" },
    });
  });
});

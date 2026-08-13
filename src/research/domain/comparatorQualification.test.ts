import { describe, expect, it } from "vitest";
import {
  ComparatorQualificationInputSchema,
  qualifyComparators,
} from "./comparatorQualification";

const evidenceId = "evidence:insightsentry:peers";
const rationale = {
  en: "The companies address the same accelerated-computing buyers.",
  ko: "동일한 가속 컴퓨팅 고객군을 대상으로 합니다.",
};
const metric = (
  key: string,
  value: number,
  period = "TTM-2026-Q2",
  unit = "multiple",
  currency?: string,
) => ({
  key,
  value,
  period,
  unit,
  ...(currency === undefined ? {} : { currency }),
  evidenceArtifactIds: [evidenceId],
});
const subject = {
  comparatorId: "subject",
  name: "Subject",
  primaryProductMarket: "accelerated computing",
  primaryCustomerMarket: "data center operators",
  metrics: [
    metric("forward_pe", 40),
    metric("revenue_growth", 30, "TTM-2026-Q2", "percent"),
    metric("operating_margin", 25, "TTM-2026-Q2", "percent"),
  ],
};
const peer = (
  comparatorId: string,
  role: "direct_competitor" | "operating_comparable" | "valuation_proxy",
  value: number,
) => ({
  comparatorId,
  name: comparatorId.toUpperCase(),
  role,
  rationale,
  primaryProductMarket: "accelerated computing",
  primaryCustomerMarket: "data center operators",
  metrics: [
    metric("forward_pe", value),
    metric("revenue_growth", 20, "TTM-2026-Q2", "percent"),
    metric("operating_margin", 18, "TTM-2026-Q2", "percent"),
  ],
});

describe("comparator qualification", () => {
  it("qualifies aligned direct competitors and a labeled proxy for a justified median", () => {
    // Given
    const input = {
      rawPeerArtifactId: evidenceId,
      subject,
      comparators: [
        peer("peer-a", "direct_competitor", 20),
        peer("peer-b", "direct_competitor", 30),
        peer("proxy-c", "valuation_proxy", 25),
      ],
    };

    // When
    const result = qualifyComparators(
      ComparatorQualificationInputSchema.parse(input),
    );

    // Then
    expect(result).toMatchObject({
      status: "qualified",
      rawPeerArtifactId: evidenceId,
      rawArtifactCount: 3,
      valuation: {
        status: "eligible",
        metricKey: "forward_pe",
        peerMedian: 25,
        subjectValue: 40,
        premiumDiscountPercent: 60,
        eligibleCompanyCount: 3,
      },
    });
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          comparatorId: "peer-a",
          role: "direct_competitor",
          displayEligibility: true,
          medianEligibility: true,
          comparableMetricKeys: expect.arrayContaining([
            "forward_pe",
            "revenue_growth",
          ]),
          evidenceArtifactIds: [evidenceId],
        }),
        expect.objectContaining({
          comparatorId: "proxy-c",
          role: "valuation_proxy",
          displayEligibility: true,
          medianEligibility: true,
        }),
      ]),
    );
    expect(result.displayGroups).toEqual([
      { role: "direct_competitor", comparatorIds: ["peer-a", "peer-b"] },
      { role: "valuation_proxy", comparatorIds: ["proxy-c"] },
    ]);
    expect(result.diagnostics).toEqual({
      candidateCount: 3,
      displayEligibleCount: 3,
      medianEligibleCount: 3,
      roleCounts: [
        {
          role: "direct_competitor",
          candidateCount: 2,
          displayEligibleCount: 2,
        },
        {
          role: "operating_comparable",
          candidateCount: 0,
          displayEligibleCount: 0,
        },
        {
          role: "valuation_proxy",
          candidateCount: 1,
          displayEligibleCount: 1,
        },
      ],
      exclusionCounts: [],
    });
  });

  it("excludes a cross-industry direct comparator without a market rationale", () => {
    // Given
    const telecom = {
      ...peer("telecom", "direct_competitor", 10),
      primaryProductMarket: "mobile networks",
      primaryCustomerMarket: "telecom carriers",
    };

    // When
    const result = qualifyComparators(
      ComparatorQualificationInputSchema.parse({
        rawPeerArtifactId: evidenceId,
        subject,
        comparators: [telecom],
      }),
    );

    // Then
    expect(result).toMatchObject({
      status: "no_qualified_comparison",
      rawArtifactCount: 1,
      diagnostics: {
        candidateCount: 1,
        displayEligibleCount: 0,
        medianEligibleCount: 0,
        primaryExclusionReason: "market_overlap_required",
        exclusionCounts: [{ reason: "market_overlap_required", count: 1 }],
      },
      valuation: { status: "not_eligible" },
      rows: [
        expect.objectContaining({
          comparatorId: "telecom",
          displayEligibility: false,
          medianEligibility: false,
          exclusionReasons: expect.arrayContaining(["market_overlap_required"]),
        }),
      ],
    });
  });

  it("keeps an operating comparable out of a valuation median without normalization", () => {
    // Given
    const operating = peer("operator", "operating_comparable", 22);

    // When
    const result = qualifyComparators(
      ComparatorQualificationInputSchema.parse({
        rawPeerArtifactId: evidenceId,
        subject,
        comparators: [operating],
      }),
    );

    // Then
    expect(result.rows).toEqual([
      expect.objectContaining({
        displayEligibility: true,
        medianEligibility: false,
        comparableMetricKeys: expect.arrayContaining(["operating_margin"]),
        exclusionReasons: expect.arrayContaining([
          "operating_valuation_normalization_required",
        ]),
      }),
    ]);
    expect(result.rows[0]?.comparableMetricKeys).not.toContain("forward_pe");
    expect(result.valuation).toMatchObject({ status: "not_eligible" });
  });

  it("does not treat revenue growth as an operating-comparable metric", () => {
    // Given
    const operating = {
      ...peer("operator", "operating_comparable", 22),
      metrics: [metric("revenue_growth_ttm", 20, "TTM-2026-Q2", "percent")],
    };
    const operatingSubject = {
      ...subject,
      metrics: [metric("revenue_growth_ttm", 30, "TTM-2026-Q2", "percent")],
    };

    // When
    const result = qualifyComparators(
      ComparatorQualificationInputSchema.parse({
        rawPeerArtifactId: evidenceId,
        subject: operatingSubject,
        comparators: [operating],
      }),
    );

    // Then
    expect(result).toMatchObject({
      status: "no_qualified_comparison",
      rows: [
        expect.objectContaining({
          comparableMetricKeys: [],
          displayEligibility: false,
          exclusionReasons: expect.arrayContaining([
            "operating_metric_required",
          ]),
        }),
      ],
    });
  });

  it("excludes period, unit, and currency mismatches", () => {
    // Given
    const mismatched = {
      ...peer("space", "valuation_proxy", 22),
      metrics: [metric("forward_pe", 22, "FY2024", "USD", "EUR")],
    };

    // When
    const result = qualifyComparators(
      ComparatorQualificationInputSchema.parse({
        rawPeerArtifactId: evidenceId,
        subject,
        comparators: [mismatched],
      }),
    );

    // Then
    expect(result.rows).toEqual([
      expect.objectContaining({
        displayEligibility: false,
        exclusionReasons: expect.arrayContaining([
          "period_mismatch",
          "unit_mismatch",
          "currency_mismatch",
        ]),
      }),
    ]);
  });

  it("shows one labeled proxy individually but never calculates a peer median", () => {
    // Given
    const input = ComparatorQualificationInputSchema.parse({
      rawPeerArtifactId: evidenceId,
      subject,
      comparators: [peer("proxy", "valuation_proxy", 22)],
    });

    // When
    const result = qualifyComparators(input);

    // Then
    expect(result).toMatchObject({
      status: "qualified",
      rows: [
        expect.objectContaining({
          role: "valuation_proxy",
          rationale,
          displayEligibility: true,
          medianEligibility: true,
        }),
      ],
      valuation: {
        status: "not_eligible",
        reason: "insufficient_eligible_companies",
        eligibleCompanyCount: 1,
      },
    });
  });

  it("does not calculate a median from fewer than three valuation proxies", () => {
    // Given
    const input = ComparatorQualificationInputSchema.parse({
      rawPeerArtifactId: evidenceId,
      subject,
      comparators: [
        peer("proxy-a", "valuation_proxy", 20),
        peer("proxy-b", "valuation_proxy", 30),
      ],
    });

    // When
    const result = qualifyComparators(input);

    // Then
    expect(result.valuation).toEqual({
      status: "not_eligible",
      reason: "insufficient_eligible_companies",
      eligibleCompanyCount: 2,
    });
  });

  it("retains raw counts, excludes duplicate peers, and is pure across replay", () => {
    // Given
    const input = ComparatorQualificationInputSchema.parse({
      rawPeerArtifactId: evidenceId,
      subject,
      comparators: [
        peer("peer-a", "direct_competitor", 20),
        peer("peer-a", "direct_competitor", 21),
      ],
    });
    const before = JSON.stringify(input);

    // When
    const first = qualifyComparators(input);
    const replay = qualifyComparators(input);

    // Then
    expect(first).toEqual(replay);
    expect(JSON.stringify(input)).toBe(before);
    expect(first).toMatchObject({ rawArtifactCount: 2 });
    expect(first.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayEligibility: false,
          exclusionReasons: expect.arrayContaining(["duplicate_comparator"]),
        }),
      ]),
    );
  });

  it("rejects untyped roles and blank rationale at the input boundary", () => {
    // Given
    const malformed = {
      rawPeerArtifactId: evidenceId,
      subject,
      comparators: [
        { ...peer("peer-a", "direct_competitor", 20), role: "similar_company" },
        {
          ...peer("peer-b", "direct_competitor", 30),
          rationale: { en: " ", ko: "" },
        },
      ],
    };

    // When
    const parsed = ComparatorQualificationInputSchema.safeParse(malformed);

    // Then
    expect(parsed.success).toBe(false);
  });
});

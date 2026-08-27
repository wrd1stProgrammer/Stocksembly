import {
  type ComparableMetric,
  type ComparatorQualificationInput,
  type ComparatorQualificationResult,
  ComparatorQualificationResultSchema,
  type ExclusionReason,
  type NormalizedMetric,
} from "./comparatorQualificationContracts";

export {
  ComparatorQualificationInputSchema,
  ComparatorQualificationResultSchema,
} from "./comparatorQualificationContracts";

const VALUATION_KEYS = new Set([
  "forward_pe",
  "price_earnings_ttm",
  "enterprise_value_ebitda_ttm",
  "enterprise_value_to_revenue_ttm",
]);
const OPERATING_KEYS = new Set([
  "gross_margin",
  "gross_margin_ttm",
  "operating_margin",
  "operating_margin_ttm",
  "unit_economics",
]);

function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
}

function effectiveMetric(metric: ComparableMetric): NormalizedMetric {
  const normalized = metric.normalization;
  return {
    key: metric.key,
    value: normalized?.value ?? metric.value,
    period: normalized?.period ?? metric.period,
    unit: normalized?.unit ?? metric.unit,
    ...(normalized?.currency === undefined && metric.currency === undefined
      ? {}
      : { currency: normalized?.currency ?? metric.currency }),
    ...(normalized === undefined ? {} : { normalizationNote: normalized.note }),
    evidenceArtifactIds: metric.evidenceArtifactIds,
  };
}

function mismatchReasons(
  subjectMetric: NormalizedMetric,
  peerMetric: NormalizedMetric,
): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  if (subjectMetric.period !== peerMetric.period)
    reasons.push("period_mismatch");
  if (subjectMetric.unit !== peerMetric.unit) reasons.push("unit_mismatch");
  if (
    (subjectMetric.currency ?? "unitless") !==
    (peerMetric.currency ?? "unitless")
  )
    reasons.push("currency_mismatch");
  return reasons;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const right = ordered[middle] ?? 0;
  const left = ordered[middle - 1] ?? right;
  return ordered.length % 2 === 0 ? (left + right) / 2 : right;
}

export function qualifyComparators(
  input: ComparatorQualificationInput,
): ComparatorQualificationResult {
  const subjectMetrics = new Map(
    input.subject.metrics.map((metric) => [
      metric.key,
      effectiveMetric(metric),
    ]),
  );
  const seen = new Set<string>();
  const rows = input.comparators.map((comparator) => {
    const duplicate = seen.has(comparator.comparatorId);
    seen.add(comparator.comparatorId);
    const metricReasons: ExclusionReason[] = [];
    const aligned = comparator.metrics.flatMap((metric) => {
      const subjectMetric = subjectMetrics.get(metric.key);
      if (subjectMetric === undefined) return [];
      const peerMetric = effectiveMetric(metric);
      const reasons = mismatchReasons(subjectMetric, peerMetric);
      metricReasons.push(...reasons);
      return reasons.length === 0 ? [peerMetric] : [];
    });
    const valuation = aligned.find((metric) => VALUATION_KEYS.has(metric.key));
    const operating = aligned.filter((metric) =>
      OPERATING_KEYS.has(metric.key),
    );
    const reasons: ExclusionReason[] = [
      ...(duplicate ? (["duplicate_comparator"] as const) : []),
      ...metricReasons,
    ];
    if (comparator.role === "direct_competitor") {
      const industryCompatible =
        input.subject.sector === undefined ||
        comparator.sector === undefined ||
        normalizedText(input.subject.sector) ===
          normalizedText(comparator.sector);
      if (!industryCompatible) reasons.push("industry_mismatch");
      const marketOverlap =
        normalizedText(comparator.primaryProductMarket) ===
          normalizedText(input.subject.primaryProductMarket) &&
        normalizedText(comparator.primaryCustomerMarket) ===
          normalizedText(input.subject.primaryCustomerMarket);
      if (!marketOverlap) reasons.push("market_overlap_required");
      if (aligned.length < 2) reasons.push("insufficient_aligned_metrics");
    }
    if (comparator.role === "operating_comparable") {
      if (operating.length === 0) reasons.push("operating_metric_required");
      if (valuation !== undefined && valuation.normalizationNote === undefined)
        reasons.push("operating_valuation_normalization_required");
    }
    if (comparator.role === "valuation_proxy" && valuation === undefined)
      reasons.push("valuation_metric_required");
    const blocking = reasons.some(
      (reason) =>
        reason !== "operating_valuation_normalization_required" &&
        !(
          comparator.role === "operating_comparable" &&
          ["period_mismatch", "unit_mismatch", "currency_mismatch"].includes(
            reason,
          ) &&
          operating.length > 0
        ),
    );
    const displayEligibility = !blocking;
    const medianEligibility =
      displayEligibility &&
      valuation !== undefined &&
      (comparator.role !== "operating_comparable" ||
        valuation.normalizationNote !== undefined);
    const comparableMetrics =
      comparator.role === "operating_comparable"
        ? aligned.filter(
            (metric) =>
              OPERATING_KEYS.has(metric.key) ||
              (VALUATION_KEYS.has(metric.key) &&
                metric.normalizationNote !== undefined),
          )
        : aligned;
    const evidenceArtifactIds = [
      ...new Set(
        comparableMetrics.flatMap((metric) => metric.evidenceArtifactIds),
      ),
    ];
    return {
      comparatorId: comparator.comparatorId,
      name: comparator.name,
      role: comparator.role,
      rationale: comparator.rationale,
      comparableMetricKeys: comparableMetrics.map((metric) => metric.key),
      normalizedMetrics: comparableMetrics,
      ...(!comparableMetrics.some(
        (metric) => metric.normalizationNote !== undefined,
      )
        ? {}
        : {
            normalizationNote: comparableMetrics
              .flatMap((metric) =>
                metric.normalizationNote === undefined
                  ? []
                  : [metric.normalizationNote],
              )
              .join("; "),
          }),
      evidenceArtifactIds,
      displayEligibility,
      medianEligibility,
      exclusionReasons: [...new Set(reasons)],
    };
  });
  const subjectValuation = [...subjectMetrics.values()].find((metric) =>
    VALUATION_KEYS.has(metric.key),
  );
  const eligibleValuations =
    subjectValuation === undefined
      ? []
      : rows.flatMap((row) =>
          row.medianEligibility
            ? row.normalizedMetrics.filter(
                (metric) => metric.key === subjectValuation.key,
              )
            : [],
        );
  const peerMedian = median(eligibleValuations.map((metric) => metric.value));
  const valuation =
    subjectValuation !== undefined && eligibleValuations.length >= 3
      ? {
          status: "eligible" as const,
          metricKey: subjectValuation.key,
          peerMedian,
          subjectValue: subjectValuation.value,
          premiumDiscountPercent: Number(
            ((subjectValuation.value / peerMedian - 1) * 100).toFixed(2),
          ),
          eligibleCompanyCount: eligibleValuations.length,
          period: subjectValuation.period,
          unit: subjectValuation.unit,
          ...(subjectValuation.currency === undefined
            ? {}
            : { currency: subjectValuation.currency }),
          evidenceArtifactIds: [
            ...new Set(
              eligibleValuations.flatMap(
                (metric) => metric.evidenceArtifactIds,
              ),
            ),
          ],
        }
      : {
          status: "not_eligible" as const,
          reason:
            subjectValuation === undefined
              ? ("valuation_metric_unavailable" as const)
              : ("insufficient_eligible_companies" as const),
          eligibleCompanyCount: eligibleValuations.length,
        };
  const roles = [
    "direct_competitor",
    "operating_comparable",
    "valuation_proxy",
  ] as const;
  const exclusionCountMap = new Map<ExclusionReason, number>();
  for (const row of rows) {
    for (const reason of row.exclusionReasons) {
      exclusionCountMap.set(reason, (exclusionCountMap.get(reason) ?? 0) + 1);
    }
  }
  const exclusionCounts = [...exclusionCountMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.reason.localeCompare(right.reason),
    );
  return ComparatorQualificationResultSchema.parse({
    status: rows.some((row) => row.displayEligibility)
      ? "qualified"
      : "no_qualified_comparison",
    rawPeerArtifactId: input.rawPeerArtifactId,
    rawArtifactCount: input.comparators.length,
    rows,
    displayGroups: roles.flatMap((role) => {
      const comparatorIds = rows
        .filter((row) => row.role === role && row.displayEligibility)
        .map((row) => row.comparatorId);
      return comparatorIds.length === 0 ? [] : [{ role, comparatorIds }];
    }),
    diagnostics: {
      candidateCount: rows.length,
      displayEligibleCount: rows.filter((row) => row.displayEligibility).length,
      medianEligibleCount: rows.filter((row) => row.medianEligibility).length,
      roleCounts: roles.map((role) => {
        const roleRows = rows.filter((row) => row.role === role);
        return {
          role,
          candidateCount: roleRows.length,
          displayEligibleCount: roleRows.filter((row) => row.displayEligibility)
            .length,
        };
      }),
      exclusionCounts,
      ...(exclusionCounts[0] === undefined
        ? {}
        : { primaryExclusionReason: exclusionCounts[0].reason }),
    },
    valuation,
  });
}

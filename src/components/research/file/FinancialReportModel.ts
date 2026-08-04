import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { ComparatorQualificationResult } from "../../../research/domain/comparatorQualificationContracts";
import type { ResearchMetricPoint } from "../../../research/domain/metricSnapshot";

export const FINANCIAL_BRIDGE_METRIC_IDS = [
  "revenue_ttm",
  "gross_margin",
  "operating_margin",
  "free_cash_flow",
  "capital_expenditures",
] as const;

type FinancialBridgeMetricId = (typeof FINANCIAL_BRIDGE_METRIC_IDS)[number];

export type FinancialBridgePeriod = {
  readonly period: string;
  readonly sortKey: number;
  readonly metrics: Readonly<
    Record<FinancialBridgeMetricId, ResearchMetricPoint>
  >;
};

function periodSortKey(period: string): number | undefined {
  const match = /^(?:FY)?(\d{4})(?:[- ]?Q([1-4]))?$/u.exec(period.trim());
  if (match?.[1] === undefined) return undefined;
  return Number(match[1]) * 10 + Number(match[2] ?? 4);
}

export function selectAlignedFinancialPeriods(
  file: Pick<ResearchFileData, "metricSnapshot">,
): readonly FinancialBridgePeriod[] {
  const grouped = new Map<string, Map<string, ResearchMetricPoint[]>>();
  for (const metric of file.metricSnapshot?.metrics ?? []) {
    if (
      metric.period === undefined ||
      !FINANCIAL_BRIDGE_METRIC_IDS.includes(
        metric.id as FinancialBridgeMetricId,
      ) ||
      periodSortKey(metric.period) === undefined
    )
      continue;
    const period = grouped.get(metric.period) ?? new Map();
    const values = period.get(metric.id) ?? [];
    values.push(metric);
    period.set(metric.id, values);
    grouped.set(metric.period, period);
  }

  const aligned = [...grouped.entries()].flatMap(([period, metrics]) => {
    if (
      FINANCIAL_BRIDGE_METRIC_IDS.some(
        (metricId) => metrics.get(metricId)?.length !== 1,
      )
    )
      return [];
    const entries = FINANCIAL_BRIDGE_METRIC_IDS.map((metricId) => [
      metricId,
      metrics.get(metricId)?.[0],
    ]).filter(
      (entry): entry is [FinancialBridgeMetricId, ResearchMetricPoint] =>
        entry[1] !== undefined,
    );
    const sortKey = periodSortKey(period);
    return sortKey === undefined
      ? []
      : [
          {
            period,
            sortKey,
            metrics: Object.fromEntries(entries) as Record<
              FinancialBridgeMetricId,
              ResearchMetricPoint
            >,
          },
        ];
  });
  return aligned.length < 2
    ? []
    : aligned.sort((first, second) => first.sortKey - second.sortKey);
}

export function selectFinancialExpectations(
  file: Pick<ResearchFileData, "metricSnapshot">,
): readonly ResearchMetricPoint[] {
  return (file.metricSnapshot?.metrics ?? [])
    .filter((metric) => metric.category === "expectations")
    .sort((first, second) => first.id.localeCompare(second.id));
}

export type FinancialDiagnostic = {
  readonly id: string;
  readonly label: Readonly<Record<Locale, string>>;
  readonly value: number;
  readonly unit: "percent";
  readonly sourceIds: readonly string[];
  readonly interpretation: Readonly<Record<Locale, string>>;
};

/** Auditable ratios derived only when both required observations exist. */
export function selectFinancialDiagnostics(
  file: Pick<ResearchFileData, "metricSnapshot">,
): readonly FinancialDiagnostic[] {
  const metrics = file.metricSnapshot?.metrics ?? [];
  const latest = (id: string) => [...metrics].reverse().find((metric) => metric.id === id);
  const revenue = latest("revenue_ttm");
  const freeCashFlow = latest("free_cash_flow");
  const capex = latest("capital_expenditures");
  const grossMargin = latest("gross_margin");
  const operatingMargin = latest("operating_margin");
  const forwardPe = latest("forward_pe") ?? latest("pe");
  const diagnostics: FinancialDiagnostic[] = [];
  if (revenue !== undefined && revenue.value !== 0 && freeCashFlow !== undefined)
    diagnostics.push({
      id: "free-cash-flow-margin",
      label: { en: "FCF / revenue", ko: "매출 대비 잉여현금" },
      value: (freeCashFlow.value / revenue.value) * 100,
      unit: "percent",
      sourceIds: [revenue.source, freeCashFlow.source],
      interpretation: {
        en: "How much reported revenue survives as discretionary cash.",
        ko: "보고 매출이 실제 재량 현금으로 얼마나 남는지 보여줍니다.",
      },
    });
  if (revenue !== undefined && revenue.value !== 0 && capex !== undefined)
    diagnostics.push({
      id: "capital-intensity",
      label: { en: "Capex / revenue", ko: "매출 대비 설비투자" },
      value: (capex.value / revenue.value) * 100,
      unit: "percent",
      sourceIds: [revenue.source, capex.source],
      interpretation: {
        en: "The capital burden required to sustain the current revenue base.",
        ko: "현재 매출 기반을 유지하는 데 필요한 자본 부담입니다.",
      },
    });
  if (grossMargin !== undefined && operatingMargin !== undefined)
    diagnostics.push({
      id: "operating-capture",
      label: { en: "Gross-to-operating capture", ko: "총마진의 영업이익 전환" },
      value: grossMargin.value === 0 ? 0 : (operatingMargin.value / grossMargin.value) * 100,
      unit: "percent",
      sourceIds: [grossMargin.source, operatingMargin.source],
      interpretation: {
        en: "How much gross-margin economics remains after operating costs.",
        ko: "매출총이익 중 영업비용을 거친 뒤 남는 수익력을 나타냅니다.",
      },
    });
  if (forwardPe !== undefined && forwardPe.value > 0)
    diagnostics.push({
      id: "earnings-yield",
      label: { en: "Forward earnings yield", ko: "선행 이익수익률" },
      value: 100 / forwardPe.value,
      unit: "percent",
      sourceIds: [forwardPe.source],
      interpretation: {
        en: "The earnings yield embedded in the observed forward multiple.",
        ko: "관측된 선행 배수에 내재된 이익수익률입니다.",
      },
    });
  return diagnostics;
}

export function selectAuditableValuation(
  qualification: ComparatorQualificationResult | undefined,
) {
  if (qualification?.valuation.status !== "eligible") return undefined;
  const valuation = qualification.valuation;
  const peers = qualification.rows.flatMap((row) => {
    if (!row.medianEligibility) return [];
    const metric = row.normalizedMetrics.find(
      (candidate) => candidate.key === valuation.metricKey,
    );
    return metric === undefined
      ? []
      : [
          {
            comparatorId: row.comparatorId,
            name: row.name,
            value: metric.value,
            evidenceArtifactIds: metric.evidenceArtifactIds,
          },
        ];
  });
  return peers.length < 3 ? undefined : { ...valuation, peers };
}

export function formatFinancialMetric(
  metric: Pick<ResearchMetricPoint, "value" | "unit">,
  locale: Locale,
): string {
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "multiple") return `${metric.value.toFixed(1)}×`;
  if (metric.unit === "USD_per_share")
    return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(metric.value);
  if (metric.unit === "USD") {
    const billions = metric.value / 1_000_000_000;
    return `$${billions.toFixed(1)}B`;
  }
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    maximumFractionDigits: 1,
  }).format(metric.value);
}

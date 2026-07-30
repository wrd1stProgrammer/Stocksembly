import { z } from "zod";

const LocalizedSchema = z
  .object({ en: z.string().min(1), ko: z.string().min(1) })
  .strict();

export const ResearchMetricPointSchema = z
  .object({
    id: z.string().min(1).max(120),
    label: LocalizedSchema,
    category: z.enum([
      "market",
      "company",
      "financial",
      "risk",
      "expectations",
    ]),
    value: z.number().finite(),
    unit: z.enum([
      "USD",
      "USD_per_share",
      "percent",
      "multiple",
      "count",
      "shares",
    ]),
    period: z.string().min(1).max(40).optional(),
    observedAt: z.string().datetime(),
    source: z.enum(["insightsentry", "sec"]),
    signal: z.enum(["higher_better", "lower_better", "contextual"]),
  })
  .strict();

export const ResearchMetricSnapshotSchema = z
  .object({
    asOf: z.string().datetime(),
    metrics: z.array(ResearchMetricPointSchema).max(64),
  })
  .strict();

export type ResearchMetricPoint = z.infer<typeof ResearchMetricPointSchema>;
export type ResearchMetricSnapshot = z.infer<
  typeof ResearchMetricSnapshotSchema
>;

type MetricDefinition = Omit<
  ResearchMetricPoint,
  "id" | "value" | "period" | "observedAt" | "source"
> & {
  readonly id: string;
  readonly providerIds: readonly string[];
};

const DEFINITIONS: readonly MetricDefinition[] = [
  {
    id: "revenue_ttm",
    providerIds: ["total_revenue_ttm"],
    label: { en: "TTM revenue", ko: "최근 12개월 매출" },
    category: "financial",
    unit: "USD",
    signal: "higher_better",
  },
  {
    id: "revenue_growth",
    providerIds: [
      "total_revenue_one_year_growth_ttm",
      "revenue_one_year_growth_ttm",
    ],
    label: { en: "Revenue growth", ko: "매출 성장률" },
    category: "financial",
    unit: "percent",
    signal: "higher_better",
  },
  {
    id: "gross_margin",
    providerIds: ["gross_margin_ttm", "gross_margin_fq"],
    label: { en: "Gross margin", ko: "매출총이익률" },
    category: "financial",
    unit: "percent",
    signal: "higher_better",
  },
  {
    id: "operating_margin",
    providerIds: ["operating_margin_fq", "operating_margin_fy"],
    label: { en: "Operating margin", ko: "영업이익률" },
    category: "financial",
    unit: "percent",
    signal: "higher_better",
  },
  {
    id: "free_cash_flow",
    providerIds: ["free_cash_flow_ttm", "free_cash_flow_fq"],
    label: { en: "Free cash flow", ko: "잉여현금흐름" },
    category: "financial",
    unit: "USD",
    signal: "higher_better",
  },
  {
    id: "capital_expenditures",
    providerIds: ["capital_expenditures_ttm", "capital_expenditures_fq"],
    label: { en: "Capital expenditure", ko: "설비투자" },
    category: "financial",
    unit: "USD",
    signal: "contextual",
  },
  {
    id: "net_debt",
    providerIds: ["net_debt_fq", "net_debt_fy"],
    label: { en: "Net debt", ko: "순부채" },
    category: "risk",
    unit: "USD",
    signal: "lower_better",
  },
  {
    id: "cash",
    providerIds: ["cash_n_short_term_invest_fq", "cash_n_equivalents_fq"],
    label: { en: "Cash and short-term investments", ko: "현금·단기투자자산" },
    category: "risk",
    unit: "USD",
    signal: "higher_better",
  },
  {
    id: "inventory",
    providerIds: ["total_inventory_fq"],
    label: { en: "Inventory", ko: "재고자산" },
    category: "risk",
    unit: "USD",
    signal: "contextual",
  },
  {
    id: "diluted_shares",
    providerIds: ["diluted_shares_outstanding_fq"],
    label: { en: "Diluted shares", ko: "희석주식 수" },
    category: "risk",
    unit: "shares",
    signal: "lower_better",
  },
  {
    id: "roic",
    providerIds: [
      "return_on_invested_capital_fq",
      "return_on_invested_capital_fy",
    ],
    label: { en: "Return on invested capital", ko: "투하자본수익률" },
    category: "financial",
    unit: "percent",
    signal: "higher_better",
  },
  {
    id: "pe",
    providerIds: ["price_earnings"],
    label: { en: "P/E", ko: "PER" },
    category: "market",
    unit: "multiple",
    signal: "contextual",
  },
  {
    id: "forward_pe",
    providerIds: ["price_earnings_forward_fq", "price_earnings_forward_fy"],
    label: { en: "Forward P/E", ko: "선행 PER" },
    category: "expectations",
    unit: "multiple",
    signal: "contextual",
  },
  {
    id: "ev_ebitda",
    providerIds: ["enterprise_value_ebitda_fq", "enterprise_value_ebitda_fy"],
    label: { en: "EV/EBITDA", ko: "EV/EBITDA" },
    category: "market",
    unit: "multiple",
    signal: "contextual",
  },
  {
    id: "ev_revenue",
    providerIds: ["ev_revenue_fq", "ev_revenue_fy"],
    label: { en: "EV/Revenue", ko: "EV/매출" },
    category: "market",
    unit: "multiple",
    signal: "contextual",
  },
  {
    id: "forward_revenue",
    providerIds: ["revenue_estimate_ntm", "revenue_forecast_next_fy"],
    label: { en: "Forward revenue", ko: "선행 매출 전망" },
    category: "expectations",
    unit: "USD",
    signal: "higher_better",
  },
  {
    id: "forward_eps",
    providerIds: ["eps_estimate_ntm", "earnings_per_share_forecast_next_fy"],
    label: { en: "Forward EPS", ko: "선행 EPS 전망" },
    category: "expectations",
    unit: "USD_per_share",
    signal: "higher_better",
  },
  {
    id: "price_target_median",
    providerIds: ["price_target_median", "price_target_average"],
    label: { en: "Consensus price target", ko: "컨센서스 목표주가" },
    category: "expectations",
    unit: "USD_per_share",
    signal: "higher_better",
  },
  {
    id: "recommendation_buy",
    providerIds: ["recommendation_buy"],
    label: { en: "Buy recommendations", ko: "매수 의견 수" },
    category: "expectations",
    unit: "count",
    signal: "higher_better",
  },
  {
    id: "recommendation_hold",
    providerIds: ["recommendation_hold"],
    label: { en: "Hold recommendations", ko: "중립 의견 수" },
    category: "expectations",
    unit: "count",
    signal: "contextual",
  },
  {
    id: "recommendation_sell",
    providerIds: ["recommendation_sell"],
    label: { en: "Sell recommendations", ko: "매도 의견 수" },
    category: "expectations",
    unit: "count",
    signal: "lower_better",
  },
];

const FundamentalsSchema = z
  .object({
    providerUpdatedAt: z.string().datetime(),
    indicators: z.array(
      z.object({
        id: z.string(),
        period: z.string().optional(),
        value: z.unknown(),
      }),
    ),
  })
  .passthrough();

const QuoteSchema = z
  .object({
    providerCode: z.string(),
    lastPrice: z.number().positive(),
    changePercent: z.number().finite().optional(),
    currency: z.string(),
    observedAt: z.string().datetime(),
  })
  .passthrough();

const PeersSchema = z
  .object({
    providerUpdatedAt: z.string().datetime(),
    subject: z
      .object({
        performance3Month: z.number().finite().optional(),
        performance1Year: z.number().finite().optional(),
      })
      .passthrough(),
    relativeValuation: z.array(
      z
        .object({
          metric: z.string(),
          premiumDiscountPercent: z.number().finite().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_|_$/gu, "")
    .slice(0, 48);
}

function segmentMetrics(input: {
  readonly indicator:
    | z.infer<typeof FundamentalsSchema>["indicators"][number]
    | undefined;
  readonly observedAt: string;
  readonly prefix: "segment" | "region";
}): ResearchMetricPoint[] {
  if (!Array.isArray(input.indicator?.value)) return [];
  const latest = input.indicator.value
    .filter(
      (item): item is { date: string | number; segments: unknown[] } =>
        typeof item === "object" &&
        item !== null &&
        "date" in item &&
        "segments" in item &&
        Array.isArray(item.segments),
    )
    .sort((left, right) => Number(right.date) - Number(left.date))[0];
  if (latest === undefined) return [];
  const segments = latest.segments.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const label =
      "label" in item && typeof item.label === "string"
        ? item.label
        : undefined;
    const value = "value" in item ? numeric(item.value) : undefined;
    return label === undefined || value === undefined ? [] : [{ label, value }];
  });
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  if (!(total > 0)) return [];
  return segments
    .sort((left, right) => right.value - left.value)
    .slice(0, input.prefix === "segment" ? 6 : 5)
    .map((item) => ({
      id: `${input.prefix}_share:${slug(item.label)}`,
      label: {
        en: `${item.label} ${input.prefix} share`,
        ko: `${item.label} ${input.prefix === "segment" ? "사업부" : "지역"} 비중`,
      },
      category: input.prefix === "segment" ? "company" : "risk",
      value: (item.value / total) * 100,
      unit: "percent",
      period: String(latest.date),
      observedAt: input.observedAt,
      source: "insightsentry",
      signal: "contextual",
    }));
}

export function buildResearchMetricSnapshot(input: {
  readonly asOf: string;
  readonly quote?: unknown;
  readonly fundamentals?: unknown;
  readonly peers?: unknown;
}): ResearchMetricSnapshot | undefined {
  const points: ResearchMetricPoint[] = [];
  const quote = QuoteSchema.safeParse(input.quote);
  if (quote.success)
    points.push({
      id: "current_price",
      label: { en: "Current price", ko: "현재가" },
      category: "market",
      value: quote.data.lastPrice,
      unit: "USD_per_share",
      observedAt: quote.data.observedAt,
      source: "insightsentry",
      signal: "contextual",
    });
  if (quote.success && quote.data.changePercent !== undefined)
    points.push({
      id: "daily_change_percent",
      label: { en: "Previous-day change", ko: "전일 대비" },
      category: "market",
      value: quote.data.changePercent,
      unit: "percent",
      observedAt: quote.data.observedAt,
      source: "insightsentry",
      signal: "contextual",
    });

  const fundamentals = FundamentalsSchema.safeParse(input.fundamentals);
  if (fundamentals.success) {
    const byId = new Map(
      fundamentals.data.indicators.map((indicator) => [
        indicator.id,
        indicator,
      ]),
    );
    for (const definition of DEFINITIONS) {
      const indicator = definition.providerIds
        .map((id) => byId.get(id))
        .find((item) => numeric(item?.value) !== undefined);
      const value = numeric(indicator?.value);
      if (indicator === undefined || value === undefined) continue;
      points.push({
        id: definition.id,
        label: definition.label,
        category: definition.category,
        value,
        unit: definition.unit,
        ...(indicator.period === undefined ? {} : { period: indicator.period }),
        observedAt: fundamentals.data.providerUpdatedAt,
        source: "insightsentry",
        signal: definition.signal,
      });
    }
    points.push(
      ...segmentMetrics({
        indicator: byId.get("revenue_seg_by_business_h"),
        observedAt: fundamentals.data.providerUpdatedAt,
        prefix: "segment",
      }),
      ...segmentMetrics({
        indicator: byId.get("revenue_seg_by_region_h"),
        observedAt: fundamentals.data.providerUpdatedAt,
        prefix: "region",
      }),
    );
  }

  const peers = PeersSchema.safeParse(input.peers);
  if (peers.success) {
    const addPerformance = (
      id: string,
      label: ResearchMetricPoint["label"],
      value: number | undefined,
    ) => {
      if (value === undefined) return;
      points.push({
        id,
        label,
        category: "market",
        value,
        unit: "percent",
        observedAt: peers.data.providerUpdatedAt,
        source: "insightsentry",
        signal: "higher_better",
      });
    };
    addPerformance(
      "relative_performance_3m",
      { en: "3-month performance", ko: "3개월 수익률" },
      peers.data.subject.performance3Month,
    );
    addPerformance(
      "relative_performance_1y",
      { en: "1-year performance", ko: "1년 수익률" },
      peers.data.subject.performance1Year,
    );
    for (const item of peers.data.relativeValuation) {
      if (item.premiumDiscountPercent === undefined) continue;
      points.push({
        id: `peer_premium:${item.metric}`,
        label: {
          en: `${item.metric.replaceAll("_", " ")} vs peers`,
          ko: `${item.metric.replaceAll("_", " ")} 동종업계 대비`,
        },
        category: "market",
        value: item.premiumDiscountPercent,
        unit: "percent",
        observedAt: peers.data.providerUpdatedAt,
        source: "insightsentry",
        signal: "contextual",
      });
    }
  }

  if (points.length === 0) return undefined;
  const unique = [
    ...new Map(points.map((point) => [point.id, point] as const)).values(),
  ].slice(0, 64);
  return ResearchMetricSnapshotSchema.parse({
    asOf: input.asOf,
    metrics: unique,
  });
}

import { z } from "zod";
import type { ResearchMetricPoint } from "./metricSnapshot";

const LocalizedSchema = z
  .object({ en: z.string().min(1), ko: z.string().min(1) })
  .strict();

export const InvestmentModelCapabilitySchema = z
  .object({
    key: z.enum([
      "price",
      "earnings",
      "cash_flow",
      "growth",
      "balance_sheet",
      "peer_comparison",
      "consensus",
    ]),
    status: z.enum(["measured", "derived", "context_only", "unavailable"]),
    label: LocalizedSchema,
  })
  .strict();

export const InvestmentScenarioSchema = z
  .object({
    id: z.enum(["downside", "base", "upside"]),
    label: LocalizedSchema,
    impliedPrice: z.number().positive().optional(),
    returnPercent: z.number().finite().optional(),
    requiredMetric: LocalizedSchema,
    requiredValue: z.number().finite().optional(),
    requiredUnit: z.enum(["USD_per_share", "percent", "multiple"]).optional(),
    assumptions: z.array(LocalizedSchema).min(1).max(4),
  })
  .strict();

export const UniversalInvestmentModelSchema = z
  .object({
    version: z.literal("universal-investment-model-v1"),
    archetype: z.enum([
      "financial_institution",
      "reit",
      "cyclical",
      "pre_profit",
      "growth",
      "cash_compounder",
      "general",
    ]),
    archetypeLabel: LocalizedSchema,
    primaryMethod: z.enum([
      "earnings_power",
      "book_value",
      "cash_flow_yield",
      "revenue_multiple",
      "ev_ebitda",
      "liquidity_runway",
      "expectation_bridge",
    ]),
    methodLabel: LocalizedSchema,
    methodNote: LocalizedSchema,
    capabilities: z.array(InvestmentModelCapabilitySchema).length(7),
    scenarios: z.array(InvestmentScenarioSchema).min(1).max(3),
    currentPrice: z.number().positive().optional(),
    consensusTarget: z.number().positive().optional(),
    consensusUpsidePercent: z.number().finite().optional(),
    freeCashFlowYieldPercent: z.number().finite().optional(),
    netCashToMarketCapPercent: z.number().finite().optional(),
    // Kept readable for reports published before the v1 scenario correction.
    // New reports no longer emit this algebraically redundant field.
    forwardEarningsGapPercent: z.number().finite().optional(),
    summary: LocalizedSchema,
  })
  .strict();

export type UniversalInvestmentModel = z.infer<
  typeof UniversalInvestmentModelSchema
>;

type MetricMap = ReadonlyMap<string, ResearchMetricPoint>;

function metric(metrics: MetricMap, id: string): number | undefined {
  const value = metrics.get(id)?.value;
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

function rounded(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function scenarioLabel(id: "downside" | "base" | "upside") {
  if (id === "downside") return { en: "Downside", ko: "하방" } as const;
  if (id === "upside") return { en: "Upside", ko: "상방" } as const;
  return { en: "Base", ko: "기준" } as const;
}

function archetypeFor(input: {
  readonly sector?: string;
  readonly metrics: MetricMap;
}): UniversalInvestmentModel["archetype"] {
  const sector = input.sector?.toLowerCase() ?? "";
  if (/bank|financial|insurance|capital markets|credit service/u.test(sector))
    return "financial_institution";
  if (/reit|real estate/u.test(sector)) return "reit";
  if (/energy|materials|mining|oil|gas|steel|chemical/u.test(sector))
    return "cyclical";
  const revenue = metric(input.metrics, "revenue_ttm");
  const totalAssets = metric(input.metrics, "total_assets");
  const operatingCashFlow = metric(input.metrics, "operating_cash_flow");
  const capitalExpenditures = metric(input.metrics, "capital_expenditures");
  const fcf = metric(input.metrics, "free_cash_flow");
  const trailingRevenue = metric(input.metrics, "revenue_ttm");
  const forwardRevenue = metric(input.metrics, "forward_revenue");
  const growth =
    metric(input.metrics, "revenue_growth") ??
    (trailingRevenue !== undefined &&
    trailingRevenue > 0 &&
    forwardRevenue !== undefined
      ? (forwardRevenue / trailingRevenue - 1) * 100
      : 0);
  const operatingMargin = metric(input.metrics, "operating_margin");
  const forwardPe = metric(input.metrics, "forward_pe");
  const evRevenue = metric(input.metrics, "ev_revenue");
  const financialStatementShape =
    revenue !== undefined &&
    revenue > 0 &&
    totalAssets !== undefined &&
    totalAssets / revenue >= 8 &&
    capitalExpenditures === 0 &&
    operatingCashFlow !== undefined &&
    fcf !== undefined &&
    Math.abs(operatingCashFlow - fcf) <= Math.max(1, Math.abs(fcf) * 0.001);
  if (financialStatementShape) return "financial_institution";
  if (
    (/biotech|biotechnology|pharmaceutical/u.test(sector) &&
      (revenue === undefined || revenue <= 0)) ||
    (fcf !== undefined && fcf < 0 && (operatingMargin ?? -1) < 0)
  )
    return "pre_profit";
  if (growth >= 20 || (forwardPe ?? 0) >= 60 || (evRevenue ?? 0) >= 12)
    return "growth";
  if (fcf !== undefined && fcf > 0) return "cash_compounder";
  return "general";
}

const ARCHETYPE_LABELS: Readonly<
  Record<UniversalInvestmentModel["archetype"], { en: string; ko: string }>
> = {
  financial_institution: {
    en: "Financial institution",
    ko: "금융회사형",
  },
  reit: { en: "REIT / asset income", ko: "리츠·자산수익형" },
  cyclical: { en: "Cyclical earnings", ko: "경기민감 이익형" },
  pre_profit: { en: "Pre-profit / event driven", ko: "적자·이벤트형" },
  growth: { en: "Growth before mature cash flow", ko: "성장 선반영형" },
  cash_compounder: { en: "Cash-generating compounder", ko: "현금창출 성장형" },
  general: { en: "General operating company", ko: "일반 사업회사형" },
};

function methodFor(
  archetype: UniversalInvestmentModel["archetype"],
  metrics: MetricMap,
): UniversalInvestmentModel["primaryMethod"] {
  const forwardEps = metric(metrics, "forward_eps");
  const fcf = metric(metrics, "free_cash_flow");
  if (archetype === "pre_profit") return "liquidity_runway";
  if (
    archetype === "financial_institution" &&
    metric(metrics, "book_value_per_share") !== undefined
  )
    return "book_value";
  if (archetype === "reit" && fcf !== undefined) return "cash_flow_yield";
  if (archetype === "cyclical" && metric(metrics, "ev_ebitda") !== undefined)
    return "ev_ebitda";
  if (
    archetype === "growth" &&
    metric(metrics, "ev_revenue") !== undefined &&
    (metric(metrics, "revenue_ttm") !== undefined ||
      metric(metrics, "forward_revenue") !== undefined)
  )
    return "revenue_multiple";
  if (forwardEps !== undefined && forwardEps > 0) return "earnings_power";
  if (fcf !== undefined && fcf > 0) return "cash_flow_yield";
  if (
    metric(metrics, "ev_revenue") !== undefined &&
    (metric(metrics, "revenue_ttm") !== undefined ||
      metric(metrics, "forward_revenue") !== undefined)
  )
    return "revenue_multiple";
  return "expectation_bridge";
}

const METHOD_LABELS: Readonly<
  Record<
    UniversalInvestmentModel["primaryMethod"],
    { label: { en: string; ko: string }; note: { en: string; ko: string } }
  >
> = {
  earnings_power: {
    label: { en: "Forward earnings power", ko: "선행 이익가치" },
    note: {
      en: "Forward EPS is tested across explicit valuation multiples; this is a sensitivity range, not a single price target.",
      ko: "선행 EPS에 서로 다른 멀티플을 적용한 민감도 범위이며 단일 목표주가가 아닙니다.",
    },
  },
  book_value: {
    label: { en: "Book-value and return bridge", ko: "장부가치·수익성 브리지" },
    note: {
      en: "Book value per share is tested across explicit price-to-book assumptions; profitability and asset quality determine whether each multiple is defensible.",
      ko: "주당순자산에 명시적 P/B 가정을 적용하며, 수익성과 자산 건전성이 각 배수의 정당성을 결정합니다.",
    },
  },
  cash_flow_yield: {
    label: { en: "Free-cash-flow yield", ko: "잉여현금흐름 수익률" },
    note: {
      en: "Equity value is tested against the cash-flow yield investors would require in each case.",
      ko: "각 경로에서 투자자가 요구할 잉여현금흐름 수익률을 기준으로 주가 민감도를 계산합니다.",
    },
  },
  revenue_multiple: {
    label: { en: "Revenue multiple bridge", ko: "매출 멀티플 브리지" },
    note: {
      en: "Forward revenue and enterprise-value multiples are used because mature earnings evidence is not yet the strongest anchor.",
      ko: "성숙한 이익보다 매출 성장 근거가 더 강해 선행 매출과 기업가치 배수로 기대를 점검합니다.",
    },
  },
  ev_ebitda: {
    label: { en: "Cycle-adjusted EV/EBITDA", ko: "사이클 조정 EV/EBITDA" },
    note: {
      en: "The current EV/EBITDA is framed as a cycle-sensitive hurdle; peak earnings are not treated as a permanent base.",
      ko: "현재 EV/EBITDA를 경기민감 허들로 해석하며 고점 이익을 영구 기준으로 두지 않습니다.",
    },
  },
  liquidity_runway: {
    label: { en: "Liquidity runway", ko: "현금 소진 여력" },
    note: {
      en: "With no dependable earnings anchor, liquidity endurance and event outcomes take precedence over a synthetic price target.",
      ko: "신뢰할 이익 기준이 없어 인위적 목표주가보다 현금 버틸 기간과 핵심 이벤트를 우선합니다.",
    },
  },
  expectation_bridge: {
    label: { en: "Expectation bridge", ko: "시장 기대 브리지" },
    note: {
      en: "The model exposes what the price and available estimates require without manufacturing an unsupported fair value.",
      ko: "근거 없는 적정가를 만들지 않고 현재 가격과 가용 추정치가 요구하는 조건을 드러냅니다.",
    },
  },
};

function capability(
  key: UniversalInvestmentModel["capabilities"][number]["key"],
  status: UniversalInvestmentModel["capabilities"][number]["status"],
) {
  const labels = {
    price: { en: "Observed price", ko: "현재 가격" },
    earnings: { en: "Earnings anchor", ko: "이익 기준" },
    cash_flow: { en: "Cash-flow anchor", ko: "현금흐름 기준" },
    growth: { en: "Growth anchor", ko: "성장 기준" },
    balance_sheet: { en: "Balance-sheet anchor", ko: "재무상태 기준" },
    peer_comparison: { en: "Qualified peers", ko: "적격 비교기업" },
    consensus: { en: "Market estimates", ko: "시장 추정치" },
  } as const;
  return { key, status, label: labels[key] };
}

function earningsScenarios(input: {
  readonly price: number;
  readonly forwardEps: number;
  readonly forwardPe?: number;
  readonly trailingEps?: number;
  readonly revenueGrowth?: number;
}): UniversalInvestmentModel["scenarios"] {
  const forwardEpsGrowth =
    input.trailingEps !== undefined && input.trailingEps > 0
      ? (input.forwardEps / input.trailingEps - 1) * 100
      : undefined;
  const growthAnchor = forwardEpsGrowth ?? input.revenueGrowth;
  const growthBasedMultiple = Math.min(
    40,
    Math.max(12, 12 + Math.max(0, growthAnchor ?? 0) * 0.65),
  );
  const observedMultiple =
    input.forwardPe !== undefined && input.forwardPe > 0
      ? Math.min(60, Math.max(8, input.forwardPe))
      : undefined;
  const baseMultiple =
    observedMultiple === undefined
      ? growthBasedMultiple
      : observedMultiple * 0.45 + growthBasedMultiple * 0.55;
  const multiples = [
    Math.max(8, baseMultiple * 0.72),
    baseMultiple,
    Math.min(60, baseMultiple * 1.28),
  ];
  return (["downside", "base", "upside"] as const).map((id, index) => {
    const multiple = rounded(multiples[index] ?? baseMultiple, 1);
    const impliedPrice = rounded(input.forwardEps * multiple);
    const assumptions = [
      {
        en: `Forward EPS $${rounded(input.forwardEps)} × ${multiple}x`,
        ko: `선행 EPS $${rounded(input.forwardEps)} × ${multiple}배`,
      },
    ];
    if (forwardEpsGrowth !== undefined) {
      assumptions.push({
        en: `Forward EPS growth versus trailing EPS: ${rounded(forwardEpsGrowth, 1)}%`,
        ko: `최근 EPS 대비 선행 EPS 증가율 ${rounded(forwardEpsGrowth, 1)}%`,
      });
    } else if (input.revenueGrowth !== undefined) {
      assumptions.push({
        en: `Latest revenue growth: ${rounded(input.revenueGrowth, 1)}%`,
        ko: `최근 매출 성장률 ${rounded(input.revenueGrowth, 1)}%`,
      });
    }
    if (input.forwardPe !== undefined && input.forwardPe > 0) {
      assumptions.push({
        en: `Current implied forward P/E: ${rounded(input.forwardPe, 1)}x`,
        ko: `현재 주가 기준 선행 PER ${rounded(input.forwardPe, 1)}배`,
      });
    }
    return {
      id,
      label: scenarioLabel(id),
      impliedPrice,
      returnPercent: rounded((impliedPrice / input.price - 1) * 100, 1),
      requiredMetric: { en: "Forward P/E", ko: "선행 PER" },
      requiredValue: multiple,
      requiredUnit: "multiple" as const,
      assumptions,
    };
  });
}

function cashFlowScenarios(input: {
  readonly price: number;
  readonly freeCashFlow: number;
  readonly shares: number;
  readonly cyclical: boolean;
}): UniversalInvestmentModel["scenarios"] {
  const yields = input.cyclical ? [9, 7, 5] : [7, 5, 3.75];
  const fcfPerShare = input.freeCashFlow / input.shares;
  return (["downside", "base", "upside"] as const).map((id, index) => {
    const requiredYield = yields[index] ?? yields[1] ?? 5;
    const impliedPrice = rounded(fcfPerShare / (requiredYield / 100));
    return {
      id,
      label: scenarioLabel(id),
      impliedPrice,
      returnPercent: rounded((impliedPrice / input.price - 1) * 100, 1),
      requiredMetric: { en: "Required FCF yield", ko: "요구 FCF 수익률" },
      requiredValue: requiredYield,
      requiredUnit: "percent" as const,
      assumptions: [
        {
          en: `FCF per share $${rounded(fcfPerShare)} at a ${requiredYield}% required yield`,
          ko: `주당 FCF $${rounded(fcfPerShare)}에 요구수익률 ${requiredYield}% 적용`,
        },
      ],
    };
  });
}

function bookValueScenarios(input: {
  readonly price: number;
  readonly bookValuePerShare: number;
  readonly returnOnEquity?: number;
}): UniversalInvestmentModel["scenarios"] {
  const roe = input.returnOnEquity ?? 0;
  const cases = [
    {
      normalizedRoe: Math.max(0, roe * 0.85),
      costOfEquity: 11.5,
      growth: 3,
    },
    {
      normalizedRoe: Math.max(0, roe * 0.95),
      costOfEquity: 10.5,
      growth: 4,
    },
    { normalizedRoe: Math.max(0, roe), costOfEquity: 9.5, growth: 5 },
  ];
  return (["downside", "base", "upside"] as const).map((id, index) => {
    const scenario = cases[index] ?? cases[1];
    const rawMultiple =
      scenario === undefined
        ? 1
        : (scenario.normalizedRoe - scenario.growth) /
          (scenario.costOfEquity - scenario.growth);
    const multiple = rounded(Math.min(4, Math.max(0.5, rawMultiple)), 2);
    const impliedPrice = rounded(input.bookValuePerShare * multiple);
    return {
      id,
      label: scenarioLabel(id),
      impliedPrice,
      returnPercent: rounded((impliedPrice / input.price - 1) * 100, 1),
      requiredMetric: { en: "Price / book", ko: "주가순자산비율(P/B)" },
      requiredValue: multiple,
      requiredUnit: "multiple" as const,
      assumptions: [
        {
          en: `Book value per share $${rounded(input.bookValuePerShare)} × ${multiple}x P/B`,
          ko: `주당순자산 $${rounded(input.bookValuePerShare)} × P/B ${multiple}배`,
        },
        ...(scenario === undefined
          ? []
          : [
              {
                en: `Normalized ROE ${rounded(scenario.normalizedRoe, 1)}%, cost of equity ${scenario.costOfEquity}%, perpetual growth ${scenario.growth}%`,
                ko: `정상화 ROE ${rounded(scenario.normalizedRoe, 1)}% · 자기자본비용 ${scenario.costOfEquity}% · 영구성장률 ${scenario.growth}%`,
              },
            ]),
      ],
    };
  });
}

function evEbitdaScenarios(input: {
  readonly price: number;
  readonly currentMultiple: number;
  readonly marketCap?: number;
  readonly netDebt?: number;
}): UniversalInvestmentModel["scenarios"] {
  const multiples = [
    Math.max(1, input.currentMultiple * 0.72),
    input.currentMultiple,
    input.currentMultiple * 1.25,
  ];
  return (["downside", "base", "upside"] as const).map((id, index) => {
    const multiple = multiples[index] ?? input.currentMultiple;
    const shares =
      input.marketCap === undefined ? undefined : input.marketCap / input.price;
    const currentEnterpriseValue =
      input.marketCap === undefined
        ? undefined
        : input.marketCap + (input.netDebt ?? 0);
    const ebitda =
      currentEnterpriseValue === undefined
        ? undefined
        : currentEnterpriseValue / input.currentMultiple;
    const impliedPrice = rounded(
      shares === undefined || ebitda === undefined
        ? input.price * (multiple / input.currentMultiple)
        : Math.max(0.01, (ebitda * multiple - (input.netDebt ?? 0)) / shares),
    );
    return {
      id,
      label: scenarioLabel(id),
      impliedPrice,
      returnPercent: rounded((impliedPrice / input.price - 1) * 100, 1),
      requiredMetric: { en: "EV / EBITDA", ko: "EV/EBITDA" },
      requiredValue: rounded(multiple, 1),
      requiredUnit: "multiple" as const,
      assumptions: [
        {
          en: `${rounded(multiple, 1)}x EV/EBITDA with net debt carried through to equity value`,
          ko: `순부채를 자기자본가치에 반영한 EV/EBITDA ${rounded(multiple, 1)}배 민감도`,
        },
      ],
    };
  });
}

function revenueScenarios(input: {
  readonly price: number;
  readonly marketCap: number;
  readonly netDebt: number;
  readonly revenue: number;
  readonly currentMultiple: number;
}): UniversalInvestmentModel["scenarios"] {
  const shares = input.marketCap / input.price;
  const multiples = [
    Math.max(0.5, input.currentMultiple * 0.65),
    input.currentMultiple,
    input.currentMultiple * 1.3,
  ];
  return (["downside", "base", "upside"] as const).map((id, index) => {
    const multiple = multiples[index] ?? input.currentMultiple;
    const impliedEquityValue = input.revenue * multiple - input.netDebt;
    const impliedPrice = rounded(Math.max(0.01, impliedEquityValue / shares));
    return {
      id,
      label: scenarioLabel(id),
      impliedPrice,
      returnPercent: rounded((impliedPrice / input.price - 1) * 100, 1),
      requiredMetric: { en: "EV/Revenue", ko: "EV/매출" },
      requiredValue: rounded(multiple, 1),
      requiredUnit: "multiple" as const,
      assumptions: [
        {
          en: `Revenue $${rounded(input.revenue / 1_000_000_000, 1)}B at ${rounded(multiple, 1)}x EV/Revenue`,
          ko: `매출 $${rounded(input.revenue / 1_000_000_000, 1)}B에 EV/매출 ${rounded(multiple, 1)}배 적용`,
        },
      ],
    };
  });
}

export function buildUniversalInvestmentModel(input: {
  readonly metrics: readonly ResearchMetricPoint[];
  readonly sector?: string;
}): UniversalInvestmentModel {
  const metrics = new Map(input.metrics.map((item) => [item.id, item]));
  const archetype = archetypeFor({
    metrics,
    ...(input.sector === undefined ? {} : { sector: input.sector }),
  });
  const primaryMethod = methodFor(archetype, metrics);
  const price = metric(metrics, "current_price");
  const marketCap = metric(metrics, "market_cap");
  const forwardEps = metric(metrics, "forward_eps");
  const reportedForwardPe = metric(metrics, "forward_pe");
  const trailingEps = metric(metrics, "eps_ttm");
  const reportedRevenueGrowth = metric(metrics, "revenue_growth");
  const freeCashFlow = metric(metrics, "free_cash_flow");
  const dilutedShares = metric(metrics, "diluted_shares");
  const derivedShares =
    dilutedShares ??
    (price !== undefined && marketCap !== undefined
      ? marketCap / price
      : undefined);
  const netDebt = metric(metrics, "net_debt") ?? 0;
  const cash = metric(metrics, "cash");
  const priceTarget = metric(metrics, "price_target_median");
  const forwardPe =
    reportedForwardPe ??
    (price !== undefined && forwardEps !== undefined && forwardEps > 0
      ? price / forwardEps
      : undefined);
  const bookValuePerShare = metric(metrics, "book_value_per_share");
  const returnOnEquity = metric(metrics, "roe");
  const peerAvailable = input.metrics.some((item) =>
    item.id.startsWith("peer_premium:"),
  );
  const revenue =
    metric(metrics, "forward_revenue") ?? metric(metrics, "revenue_ttm");
  const trailingRevenue = metric(metrics, "revenue_ttm");
  const forwardRevenue = metric(metrics, "forward_revenue");
  const revenueGrowth =
    reportedRevenueGrowth ??
    (trailingRevenue !== undefined &&
    trailingRevenue > 0 &&
    forwardRevenue !== undefined
      ? (forwardRevenue / trailingRevenue - 1) * 100
      : undefined);
  const evRevenue = metric(metrics, "ev_revenue");

  let scenarios: UniversalInvestmentModel["scenarios"] = [];
  if (
    primaryMethod === "book_value" &&
    price !== undefined &&
    bookValuePerShare !== undefined &&
    bookValuePerShare > 0
  )
    scenarios = bookValueScenarios({
      price,
      bookValuePerShare,
      ...(returnOnEquity === undefined ? {} : { returnOnEquity }),
    });
  else if (
    primaryMethod === "ev_ebitda" &&
    price !== undefined &&
    metric(metrics, "ev_ebitda") !== undefined &&
    (metric(metrics, "ev_ebitda") ?? 0) > 0
  )
    scenarios = evEbitdaScenarios({
      price,
      currentMultiple: metric(metrics, "ev_ebitda") ?? 1,
      ...(marketCap === undefined ? {} : { marketCap }),
      ...(netDebt === undefined ? {} : { netDebt }),
    });
  else if (
    primaryMethod === "cash_flow_yield" &&
    price !== undefined &&
    freeCashFlow !== undefined &&
    freeCashFlow > 0 &&
    derivedShares !== undefined &&
    derivedShares > 0
  )
    scenarios = cashFlowScenarios({
      price,
      freeCashFlow,
      shares: derivedShares,
      cyclical: archetype === "cyclical",
    });
  else if (
    primaryMethod === "earnings_power" &&
    price !== undefined &&
    forwardEps !== undefined &&
    forwardEps > 0
  )
    scenarios = earningsScenarios({
      price,
      forwardEps,
      ...(forwardPe === undefined ? {} : { forwardPe }),
      ...(trailingEps === undefined ? {} : { trailingEps }),
      ...(revenueGrowth === undefined ? {} : { revenueGrowth }),
    });
  else if (
    primaryMethod === "revenue_multiple" &&
    price !== undefined &&
    marketCap !== undefined &&
    revenue !== undefined &&
    revenue > 0 &&
    evRevenue !== undefined &&
    evRevenue > 0
  )
    scenarios = revenueScenarios({
      price,
      marketCap,
      netDebt,
      revenue,
      currentMultiple: evRevenue,
    });
  else {
    const runwayYears =
      cash !== undefined && freeCashFlow !== undefined && freeCashFlow < 0
        ? cash / Math.abs(freeCashFlow)
        : undefined;
    scenarios = [
      {
        id: "base",
        label: scenarioLabel("base"),
        requiredMetric:
          runwayYears === undefined
            ? { en: "Next operating proof", ko: "다음 운영 증거" }
            : { en: "Cash runway", ko: "현금 버틸 기간" },
        ...(runwayYears === undefined
          ? {}
          : {
              requiredValue: rounded(runwayYears, 1),
              requiredUnit: "multiple" as const,
            }),
        assumptions: [
          runwayYears === undefined
            ? {
                en: "A price range is withheld until an earnings, cash-flow, or revenue anchor is available.",
                ko: "이익·현금흐름·매출 기준 중 하나가 확보될 때까지 가격 범위를 만들지 않습니다.",
              }
            : {
                en: `Current cash covers about ${rounded(runwayYears, 1)} years of the latest annualized cash burn.`,
                ko: `현재 현금은 최근 연환산 현금 소진액 약 ${rounded(runwayYears, 1)}년분입니다.`,
              },
        ],
      },
    ];
  }

  const fcfYield =
    archetype !== "financial_institution" &&
    freeCashFlow !== undefined &&
    marketCap !== undefined &&
    marketCap > 0
      ? (freeCashFlow / marketCap) * 100
      : undefined;
  const netCashToMarketCap =
    archetype !== "financial_institution" &&
    marketCap !== undefined &&
    marketCap > 0
      ? (((netDebt < 0 ? Math.abs(netDebt) : cash) ?? 0) / marketCap) * 100
      : undefined;
  const range = scenarios.flatMap((item) =>
    item.impliedPrice === undefined ? [] : [item.impliedPrice],
  );
  const rangeText =
    range.length >= 2
      ? {
          en: `The explicit sensitivity range is $${Math.min(...range).toFixed(2)}–$${Math.max(...range).toFixed(2)}; the spread shows which operating and valuation assumptions matter, not a promise of fair value.`,
          ko: `명시적 민감도 범위는 $${Math.min(...range).toFixed(2)}~$${Math.max(...range).toFixed(2)}이며, 이 폭은 적정가 약속이 아니라 어떤 실적·배수 가정이 중요한지를 보여줍니다.`,
        }
      : METHOD_LABELS[primaryMethod].note;

  return UniversalInvestmentModelSchema.parse({
    version: "universal-investment-model-v1",
    archetype,
    archetypeLabel: ARCHETYPE_LABELS[archetype],
    primaryMethod,
    methodLabel: METHOD_LABELS[primaryMethod].label,
    methodNote: METHOD_LABELS[primaryMethod].note,
    capabilities: [
      capability("price", price === undefined ? "unavailable" : "measured"),
      capability(
        "earnings",
        forwardEps !== undefined
          ? "measured"
          : metric(metrics, "pe") !== undefined
            ? "context_only"
            : "unavailable",
      ),
      capability(
        "cash_flow",
        freeCashFlow === undefined
          ? "unavailable"
          : archetype === "financial_institution"
            ? "context_only"
            : "measured",
      ),
      capability(
        "growth",
        revenueGrowth === undefined && revenue === undefined
          ? "unavailable"
          : reportedRevenueGrowth !== undefined
            ? "measured"
            : revenueGrowth !== undefined
              ? "derived"
              : "context_only",
      ),
      capability(
        "balance_sheet",
        netDebt !== 0 || cash !== undefined ? "measured" : "unavailable",
      ),
      capability("peer_comparison", peerAvailable ? "measured" : "unavailable"),
      capability(
        "consensus",
        priceTarget !== undefined || forwardEps !== undefined
          ? "context_only"
          : "unavailable",
      ),
    ],
    scenarios,
    ...(price === undefined ? {} : { currentPrice: price }),
    ...(priceTarget === undefined ? {} : { consensusTarget: priceTarget }),
    ...(price === undefined || priceTarget === undefined
      ? {}
      : {
          consensusUpsidePercent: rounded((priceTarget / price - 1) * 100, 1),
        }),
    ...(fcfYield === undefined
      ? {}
      : { freeCashFlowYieldPercent: rounded(fcfYield, 1) }),
    ...(netCashToMarketCap === undefined
      ? {}
      : { netCashToMarketCapPercent: rounded(netCashToMarketCap, 1) }),
    summary: rangeText,
  });
}

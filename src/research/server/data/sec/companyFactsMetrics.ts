export const CORE_METRICS = [
  "revenue",
  "operating_income",
  "net_income",
  "diluted_eps",
  "assets",
  "liabilities",
  "equity",
  "cash",
  "operating_cash_flow",
  "capex",
  "shares",
  "stock_compensation",
] as const;

export const TTM_METRICS = [
  "revenue",
  "operating_income",
  "net_income",
  "operating_cash_flow",
  "capex",
  "stock_compensation",
] as const;

export type CoreMetric = (typeof CORE_METRICS)[number];
export type TtmMetric = (typeof TTM_METRICS)[number];
export type FactPeriodKind = "annual" | "quarter" | "instant";

type MetricDefinition = {
  readonly metric: CoreMetric;
  readonly units: readonly string[];
  readonly periodType: "duration" | "instant";
  readonly precedence: number;
};

const METRIC_TAGS: Readonly<Record<string, MetricDefinition>> = {
  RevenueFromContractWithCustomerExcludingAssessedTax: {
    metric: "revenue",
    units: ["USD"],
    periodType: "duration",
    precedence: 0,
  },
  SalesRevenueNet: {
    metric: "revenue",
    units: ["USD"],
    periodType: "duration",
    precedence: 1,
  },
  Revenues: {
    metric: "revenue",
    units: ["USD"],
    periodType: "duration",
    precedence: 2,
  },
  OperatingIncomeLoss: {
    metric: "operating_income",
    units: ["USD"],
    periodType: "duration",
    precedence: 0,
  },
  NetIncomeLoss: {
    metric: "net_income",
    units: ["USD"],
    periodType: "duration",
    precedence: 0,
  },
  ProfitLoss: {
    metric: "net_income",
    units: ["USD"],
    periodType: "duration",
    precedence: 1,
  },
  EarningsPerShareDiluted: {
    metric: "diluted_eps",
    units: ["USD/shares"],
    periodType: "duration",
    precedence: 0,
  },
  Assets: {
    metric: "assets",
    units: ["USD"],
    periodType: "instant",
    precedence: 0,
  },
  Liabilities: {
    metric: "liabilities",
    units: ["USD"],
    periodType: "instant",
    precedence: 0,
  },
  StockholdersEquity: {
    metric: "equity",
    units: ["USD"],
    periodType: "instant",
    precedence: 0,
  },
  StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: {
    metric: "equity",
    units: ["USD"],
    periodType: "instant",
    precedence: 1,
  },
  CashAndCashEquivalentsAtCarryingValue: {
    metric: "cash",
    units: ["USD"],
    periodType: "instant",
    precedence: 0,
  },
  CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: {
    metric: "cash",
    units: ["USD"],
    periodType: "instant",
    precedence: 1,
  },
  NetCashProvidedByUsedInOperatingActivities: {
    metric: "operating_cash_flow",
    units: ["USD"],
    periodType: "duration",
    precedence: 0,
  },
  PaymentsToAcquirePropertyPlantAndEquipment: {
    metric: "capex",
    units: ["USD"],
    periodType: "duration",
    precedence: 0,
  },
  EntityCommonStockSharesOutstanding: {
    metric: "shares",
    units: ["shares"],
    periodType: "instant",
    precedence: 0,
  },
  WeightedAverageNumberOfDilutedSharesOutstanding: {
    metric: "shares",
    units: ["shares"],
    periodType: "duration",
    precedence: 1,
  },
  ShareBasedCompensation: {
    metric: "stock_compensation",
    units: ["USD"],
    periodType: "duration",
    precedence: 0,
  },
};

export function metricDefinition(tag: string): MetricDefinition | undefined {
  return METRIC_TAGS[tag];
}

export function metricUnits(metric: CoreMetric): readonly string[] {
  const definition = Object.values(METRIC_TAGS).find(
    (candidate) => candidate.metric === metric,
  );
  return definition?.units ?? [];
}

export function periodKind(
  start: string | undefined,
  end: string,
  periodType: MetricDefinition["periodType"],
): FactPeriodKind | undefined {
  if (periodType === "instant")
    return start === undefined ? "instant" : undefined;
  if (start === undefined) return undefined;
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  if (days >= 70 && days <= 120) return "quarter";
  if (days >= 300 && days <= 400) return "annual";
  return undefined;
}

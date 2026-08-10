import { ZodError } from "zod";
import {
  type InsightSentryClient,
  InsightSentryClientError,
} from "./insightSentryClient";
import type {
  FamilyResult,
  FundamentalsDataset,
  FundamentalValue,
  InsightSentryResearchRollout,
} from "./insightSentryResearchContracts";
import {
  FundamentalsResponseSchema,
  FundamentalsSeriesResponseSchema,
} from "./insightSentryResearchSchemas";
import {
  familyFailure,
  pitUnsafeTimestamps,
  unixMillisecondsToIso,
  withheldWhenDisabled,
} from "./insightSentryResearchSupport";

const FUNDAMENTALS_TTL = 30 * 24 * 60 * 60 * 1_000;
const SERIES_TTL = 24 * 60 * 60 * 1_000;
const DECISION_RELEVANT_METRIC =
  /revenue|income|earnings|eps|margin|cash|debt|asset|liabilit|equity|share|valuation|price.?earnings|return|capex|research|growth|dividend|working.?capital/iu;
const PRIORITY_INDICATORS = new Set([
  "total_revenue_fq",
  "total_revenue_ttm",
  "revenue_one_year_growth_ttm",
  "gross_margin_fq",
  "gross_margin_ttm",
  "operating_margin_fq",
  "net_margin_ttm",
  "net_income_fq",
  "earnings_per_share_diluted_fq",
  "earnings_per_share_diluted_ttm",
  "cash_f_operating_activities_fq",
  "free_cash_flow_fq",
  "free_cash_flow_ttm",
  "capital_expenditures_fq",
  "cash_n_short_term_invest_fq",
  "net_debt_fq",
  "total_inventory_fq",
  "accounts_receivables_net_fq",
  "diluted_shares_outstanding_fq",
  "return_on_equity_fq",
  "return_on_equity_ttm",
  "return_on_invested_capital_fq",
  "book_value_per_share_fq",
  "price_book_fq",
  "price_to_book",
  "dividends_yield_current",
  "total_assets_fq",
  "total_equity_fq",
  "total_liabilities_fq",
  "debt_to_equity_fq",
  "market_cap_basic",
  "price_earnings",
  "price_earnings_forward_fq",
  "enterprise_value_ebitda_fq",
  "ev_revenue_fq",
  "eps_estimate_ntm",
  "revenue_estimate_ntm",
  "earnings_estimate_fq",
  "sales_estimates_fq",
  "price_target_average",
  "price_target_median",
  "price_target_high",
  "price_target_low",
  "price_target_estimates_num",
  "recommendation_buy",
  "recommendation_hold",
  "recommendation_sell",
  "revenue_forecast_next_fq",
  "earnings_per_share_forecast_next_fq",
  "revenue_seg_by_business_h",
  "revenue_seg_by_region_h",
]);

function normalizedFundamentalValue(
  value: unknown,
): FundamentalValue | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    const normalized = value.flatMap((item) => {
      const parsed = normalizedFundamentalValue(item);
      return parsed === undefined ? [] : [parsed];
    });
    return normalized.length === 0 ? undefined : normalized;
  }
  if (typeof value !== "object") return undefined;
  const normalized = Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const parsed = normalizedFundamentalValue(item);
      return parsed === undefined ? [] : [[key, parsed] as const];
    }),
  );
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

export async function collectInsightSentryFundamentals(input: {
  readonly client: InsightSentryClient;
  readonly rollout: InsightSentryResearchRollout;
  readonly symbol: string;
  readonly asOf: string;
  readonly seriesIndicatorIds: readonly string[];
  readonly periods: number;
}): Promise<FamilyResult<FundamentalsDataset>> {
  const disabled = withheldWhenDisabled<FundamentalsDataset>(
    input.rollout,
    "fundamentals",
  );
  if (disabled !== undefined) return disabled;
  const snapshotResult = await input.client
    .get({
      endpoint: "fundamentals",
      pathSegments: ["symbols", input.symbol, "fundamentals"],
      parameters: {},
      asOfBucket: input.asOf.slice(0, 10),
      schema: FundamentalsResponseSchema,
      cacheTtlMilliseconds: FUNDAMENTALS_TTL,
    })
    .then(
      (value) => ({ kind: "available" as const, value }),
      (error: unknown) => {
        if (
          error instanceof InsightSentryClientError ||
          error instanceof ZodError
        )
          return {
            kind: "failure" as const,
            value: familyFailure<FundamentalsDataset>(error),
          };
        throw error;
      },
    );
  if (snapshotResult.kind === "failure") return snapshotResult.value;
  const snapshot = snapshotResult.value;
  const indicators = [...snapshot.data.data]
    .sort((left, right) => {
      const priorityDelta =
        Number(PRIORITY_INDICATORS.has(right.id)) -
        Number(PRIORITY_INDICATORS.has(left.id));
      if (priorityDelta !== 0) return priorityDelta;
      const leftRelevant = DECISION_RELEVANT_METRIC.test(
        `${left.id} ${left.name ?? ""} ${left.category ?? ""}`,
      );
      const rightRelevant = DECISION_RELEVANT_METRIC.test(
        `${right.id} ${right.name ?? ""} ${right.category ?? ""}`,
      );
      return (
        Number(rightRelevant) - Number(leftRelevant) ||
        left.id.localeCompare(right.id)
      );
    })
    .filter(
      (indicator, index, all) =>
        index === 0 || all[index - 1]?.id !== indicator.id,
    )
    .slice(0, 120)
    .flatMap((indicator) => {
      const value = normalizedFundamentalValue(indicator.value);
      return value === undefined
        ? []
        : [
            Object.freeze({
              id: indicator.id,
              ...(indicator.name === undefined ? {} : { name: indicator.name }),
              ...(indicator.category === undefined
                ? {}
                : { category: indicator.category }),
              ...(indicator.period === undefined
                ? {}
                : { period: indicator.period }),
              value,
            }),
          ];
    });
  const ids = [...new Set(input.seriesIndicatorIds)].sort().slice(0, 20);
  const periodLimit = Math.min(20, Math.max(12, Math.floor(input.periods)));
  const batches = Array.from(
    { length: Math.ceil(ids.length / 5) },
    (_, index) => ids.slice(index * 5, index * 5 + 5),
  );
  const responses = await Promise.allSettled(
    batches.map(
      async (batch) =>
        await input.client.get({
          endpoint: "fundamentals_series",
          pathSegments: ["symbols", input.symbol, "fundamentals", "series"],
          parameters: { ids: batch },
          asOfBucket: input.asOf.slice(0, 10),
          schema: FundamentalsSeriesResponseSchema,
          cacheTtlMilliseconds: SERIES_TTL,
        }),
    ),
  );
  const series = responses
    .flatMap((response) =>
      response.status === "fulfilled" ? response.value.data.data : [],
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) =>
      Object.freeze({
        id: item.id,
        name: item.name,
        points: [...item.data]
          .sort((left, right) => left.time - right.time)
          .slice(-periodLimit)
          .map((point) => Object.freeze({ ...point })),
      }),
    );
  const availableSeriesIds = new Set(series.map((item) => item.id));
  return Object.freeze({
    status: "available",
    data: Object.freeze({
      symbol: snapshot.data.code,
      ...pitUnsafeTimestamps(
        unixMillisecondsToIso(snapshot.data.last_update),
        snapshot.retrievedAt,
      ),
      indicators,
      series,
      unavailableSeriesIds: ids.filter((id) => !availableSeriesIds.has(id)),
    }),
  });
}

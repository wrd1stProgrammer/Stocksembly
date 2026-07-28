import { ZodError } from "zod";
import {
  type InsightSentryClient,
  InsightSentryClientError,
} from "./insightSentryClient";
import type {
  FamilyResult,
  FundamentalIndicator,
  FundamentalsDataset,
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

function normalizedFundamentalValue(
  value: unknown,
): FundamentalIndicator["value"] | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (!Array.isArray(value)) return undefined;
  const normalized: (number | string)[] = [];
  for (const item of value) {
    if (typeof item === "number" && Number.isFinite(item))
      normalized.push(item);
    else if (typeof item === "string") normalized.push(item);
    else if (typeof item === "boolean") normalized.push(String(item));
  }
  return normalized.length === 0 ? undefined : normalized;
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
  try {
    const snapshot = await input.client.get({
      endpoint: "fundamentals",
      pathSegments: ["symbols", input.symbol, "fundamentals"],
      parameters: {},
      asOfBucket: input.asOf.slice(0, 10),
      schema: FundamentalsResponseSchema,
      cacheTtlMilliseconds: FUNDAMENTALS_TTL,
    });
    const indicators = [...snapshot.data.data]
      .sort((left, right) => {
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
      .slice(0, 60)
      .flatMap((indicator) => {
        const value = normalizedFundamentalValue(indicator.value);
        return value === undefined
          ? []
          : [
              Object.freeze({
                id: indicator.id,
                ...(indicator.name === undefined
                  ? {}
                  : { name: indicator.name }),
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
    const responses = await Promise.all(
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
      .flatMap((response) => response.data.data)
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
      }),
    });
  } catch (error) {
    if (error instanceof InsightSentryClientError || error instanceof ZodError)
      return familyFailure(error);
    throw error;
  }
}

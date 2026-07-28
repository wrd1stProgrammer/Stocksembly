import type { z } from "zod";
import type {
  InsightSentryBarSet,
  InsightSentrySymbol,
} from "./insightSentryMarket";
import {
  InfoResponseSchema,
  type RawBarSchema,
  type SearchResponseSchema,
  type SeriesResponseSchema,
} from "./insightSentryMarketSchemas";

export const DAY = 24 * 60 * 60 * 1_000;
export const INFO_TTL = 30 * DAY;
export const ACTION_TTL = 7 * DAY;
export const QUOTE_TTL = 15_000;
export const SERIES_TTL = 5 * 60 * 1_000;
export const SEARCH_TTL = DAY;

const SUPPORTED_SECURITY_TYPES = new Set([
  "stock",
  "common_stock",
  "depository_receipt",
  "preferred_stock",
  "reit",
]);
const ACTIVE_PROVIDER_STATUSES = new Set(["active", "trading", "supported"]);

function exchange(
  value: string | undefined,
): InsightSentrySymbol["exchange"] | undefined {
  const normalized = value?.trim().toUpperCase().replaceAll("_", " ");
  if (normalized?.startsWith("NASDAQ")) return "NASDAQ";
  if (normalized === "NYSE" || normalized === "NEW YORK STOCK EXCHANGE")
    return "NYSE";
  if (
    normalized === "AMEX" ||
    normalized === "NYSE AMERICAN" ||
    normalized === "NYSE MKT"
  )
    return "NYSE_AMERICAN";
  return undefined;
}

function normalizedAliases(
  ticker: string,
  providerCode: string,
): readonly string[] {
  return Object.freeze([
    ...new Set([
      ticker,
      providerCode,
      ticker.replaceAll(".", "-"),
      ticker.replaceAll(".", "/"),
      ticker.replaceAll("/", "."),
      ticker.replaceAll("-", "."),
    ]),
  ]);
}

export function normalizeSymbol(
  input: z.infer<typeof SearchResponseSchema>["symbols"][number],
): InsightSentrySymbol | undefined {
  const separator = input.code.indexOf(":");
  if (separator < 1 || separator === input.code.length - 1) return undefined;
  const symbol = input.code
    .slice(separator + 1)
    .trim()
    .toUpperCase();
  const normalizedExchange = exchange(
    input.exchange ?? input.code.slice(0, separator),
  );
  const securityType = input.type?.trim().toLowerCase() ?? "unsupported";
  const currency = input.currency_code?.toUpperCase() ?? "";
  const country = input.country?.toUpperCase();
  const rawStatus = input.status?.toLowerCase();
  const status =
    rawStatus === "delisted" || rawStatus === "inactive"
      ? "delisted"
      : (rawStatus !== undefined && !ACTIVE_PROVIDER_STATUSES.has(rawStatus)) ||
          normalizedExchange === undefined ||
          country !== "US" ||
          currency !== "USD" ||
          !SUPPORTED_SECURITY_TYPES.has(securityType)
        ? "unsupported"
        : "active";
  if (normalizedExchange === undefined || status === "unsupported")
    return undefined;
  return Object.freeze({
    symbol,
    providerCode: input.code.toUpperCase(),
    company: input.name,
    exchange: normalizedExchange,
    securityType,
    currency,
    status,
    aliases: normalizedAliases(symbol, input.code.toUpperCase()),
  });
}

export function bucket(milliseconds: number): string {
  return new Date(
    Math.floor(Date.now() / milliseconds) * milliseconds,
  ).toISOString();
}

export function infoRequest(
  providerCode: string,
  ttl: number,
  asOfBucket: string,
) {
  return {
    endpoint: "/v3/symbols/{symbol}/info",
    pathSegments: ["symbols", providerCode, "info"],
    parameters: {},
    asOfBucket,
    cacheTtlMilliseconds: ttl,
    schema: InfoResponseSchema,
  } as const;
}

export function normalizeBars(
  response: z.infer<typeof SeriesResponseSchema>,
  timeframe: InsightSentryBarSet["timeframe"],
  requestedBarCount: number,
): InsightSentryBarSet {
  const unique = new Map<number, z.infer<typeof RawBarSchema>>();
  for (const row of response.series) unique.set(row.time, row);
  const bars = [...unique.values()]
    .sort((left, right) => left.time - right.time)
    .map((row) =>
      Object.freeze({
        timestamp: new Date(row.time * 1_000).toISOString(),
        timeframe,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      }),
    );
  const first = bars[0];
  const last = bars.at(-1);
  if (first === undefined || last === undefined)
    throw new RangeError("InsightSentry series returned no bars");
  return Object.freeze({
    timeframe,
    bars: Object.freeze(bars),
    coverage: Object.freeze({
      observedStart: first.timestamp,
      observedEnd: last.timestamp,
      barCount: bars.length,
      requestedBarCount,
      partial: bars.length < requestedBarCount,
    }),
  });
}

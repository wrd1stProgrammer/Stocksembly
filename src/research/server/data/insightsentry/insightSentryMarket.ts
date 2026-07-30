import {
  QuoteResponseSchema,
  SearchResponseSchema,
  SeriesResponseSchema,
} from "./insightSentryMarketSchemas";
import {
  ACTION_TTL,
  bucket,
  INFO_TTL,
  infoRequest,
  normalizeBars,
  normalizeSymbol,
  QUOTE_TTL,
  SEARCH_TTL,
  SERIES_TTL,
} from "./insightSentryMarketSupport";
import type { InsightSentryClient } from "./insightSentryTypes";

export type InsightSentrySymbol = {
  readonly symbol: string;
  readonly providerCode: string;
  readonly company: string;
  readonly exchange: "NASDAQ" | "NYSE" | "NYSE_AMERICAN";
  readonly securityType: string;
  readonly currency: string;
  readonly status: "active" | "delisted" | "unsupported";
  readonly aliases: readonly string[];
};

export type InsightSentryBar = {
  readonly timestamp: string;
  readonly timeframe: "1h" | "4h" | "1d";
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
};

export type InsightSentryBarSet = {
  readonly timeframe: "1h" | "4h" | "1d";
  readonly bars: readonly InsightSentryBar[];
  readonly coverage: {
    readonly observedStart: string;
    readonly observedEnd: string;
    readonly barCount: number;
    readonly requestedBarCount: number;
    readonly partial: boolean;
  };
};

type SeriesRequest = {
  readonly barType: "hour" | "day";
  readonly interval: 1 | 4;
  readonly timeframe: InsightSentryBarSet["timeframe"];
  readonly pointCount: 390 | 1_000;
};

export type InsightSentryCompanyInfo = {
  readonly providerCode: string;
  readonly company?: string;
  readonly securityType?: string;
  readonly exchange?: string;
  readonly currency?: string;
};

export type InsightSentryCorporateAction = {
  readonly occurredAt: string;
  readonly splitFactor: number;
};

export type InsightSentryQuote = {
  readonly providerCode: string;
  readonly marketState: "OPEN" | "CLOSED" | "PRE" | "POST" | "HOLIDAYS";
  readonly observedAt?: string;
  readonly lastPrice?: number;
  readonly change?: number;
  readonly changePercent?: number;
  readonly currency?: string;
};

export interface InsightSentryMarket {
  readonly searchSymbols: (
    query: string,
  ) => Promise<readonly InsightSentrySymbol[]>;
  readonly technicalBars: (
    providerCode: string,
  ) => Promise<
    readonly [InsightSentryBarSet, InsightSentryBarSet, InsightSentryBarSet]
  >;
  readonly companyInfo: (
    providerCode: string,
  ) => Promise<InsightSentryCompanyInfo>;
  readonly corporateActions: (
    providerCode: string,
  ) => Promise<readonly InsightSentryCorporateAction[]>;
  readonly quote: (providerCode: string) => Promise<InsightSentryQuote>;
}

export function createInsightSentryMarket(
  client: InsightSentryClient,
): InsightSentryMarket {
  async function series(
    providerCode: string,
    request: SeriesRequest,
  ): Promise<InsightSentryBarSet> {
    const result = await client.get({
      endpoint: "/v3/symbols/{symbol}/series",
      pathSegments: ["symbols", providerCode, "series"],
      parameters: {
        bar_type: request.barType,
        bar_interval: request.interval,
        dp: request.pointCount,
      },
      adjustmentFlags: {
        split: true,
        dadj: false,
        badj: false,
        extended: false,
        long_poll: false,
      },
      asOfBucket: bucket(SERIES_TTL),
      cacheTtlMilliseconds: SERIES_TTL,
      schema: SeriesResponseSchema,
    });
    return normalizeBars(result.data, request.timeframe, request.pointCount);
  }

  return {
    searchSymbols: async (query) => {
      const normalized = query.trim().toLowerCase();
      if (normalized.length < 1 || normalized.length > 64) return [];
      const result = await client.get({
        endpoint: "/v3/symbols/search",
        pathSegments: ["symbols", "search"],
        parameters: {
          query: normalized,
          type: "none",
          country: "US",
          page: 1,
        },
        asOfBucket: normalized,
        cacheTtlMilliseconds: SEARCH_TTL,
        schema: SearchResponseSchema,
      });
      return Object.freeze(
        result.data.symbols.flatMap((candidate) => {
          const value = normalizeSymbol(candidate);
          return value === undefined ? [] : [value];
        }),
      );
    },
    technicalBars: async (providerCode) => {
      const [hourly, fourHourly, daily] = await Promise.all([
        series(providerCode, {
          barType: "hour",
          interval: 1,
          timeframe: "1h",
          pointCount: 390,
        }),
        series(providerCode, {
          barType: "hour",
          interval: 4,
          timeframe: "4h",
          pointCount: 390,
        }),
        series(providerCode, {
          barType: "day",
          interval: 1,
          timeframe: "1d",
          pointCount: 1_000,
        }),
      ]);
      return Object.freeze([hourly, fourHourly, daily]);
    },
    companyInfo: async (providerCode) => {
      const result = await client.get(
        infoRequest(providerCode, INFO_TTL, bucket(INFO_TTL)),
      );
      return Object.freeze({
        providerCode: result.data.code,
        ...(result.data.name === undefined
          ? {}
          : { company: result.data.name }),
        ...(result.data.type === undefined
          ? {}
          : { securityType: result.data.type }),
        ...(result.data.exchange === undefined
          ? {}
          : { exchange: result.data.exchange }),
        ...(result.data.currency_code === undefined
          ? {}
          : { currency: result.data.currency_code }),
      });
    },
    corporateActions: async (providerCode) => {
      const result = await client.get(
        infoRequest(providerCode, ACTION_TTL, bucket(ACTION_TTL)),
      );
      return Object.freeze(
        (result.data.splits ?? []).map((split) =>
          Object.freeze({
            occurredAt: new Date(split.time * 1_000).toISOString(),
            splitFactor: split.factor,
          }),
        ),
      );
    },
    quote: async (providerCode) => {
      const result = await client.get({
        endpoint: "/v3/symbols/quotes",
        pathSegments: ["symbols", "quotes"],
        parameters: { codes: providerCode },
        adjustmentFlags: {
          split: true,
          dadj: false,
          badj: false,
          extended: false,
          long_poll: false,
        },
        asOfBucket: bucket(QUOTE_TTL),
        cacheTtlMilliseconds: QUOTE_TTL,
        schema: QuoteResponseSchema,
      });
      const quote = result.data.data.find(
        (candidate) => candidate.code === providerCode,
      );
      if (quote === undefined)
        throw new RangeError("InsightSentry quote missing requested symbol");
      const derivedChangePercent =
        quote.change_p ??
        (quote.change === undefined ||
        quote.last_price === undefined ||
        quote.last_price - quote.change <= 0
          ? undefined
          : (quote.change / (quote.last_price - quote.change)) * 100);
      return Object.freeze({
        providerCode: quote.code,
        marketState: quote.status,
        ...(quote.lp_time === undefined
          ? {}
          : { observedAt: new Date(quote.lp_time * 1_000).toISOString() }),
        ...(quote.last_price === undefined
          ? {}
          : { lastPrice: quote.last_price }),
        ...(quote.change === undefined ? {} : { change: quote.change }),
        ...(derivedChangePercent === undefined
          ? {}
          : { changePercent: derivedChangePercent }),
        ...(quote.currency_code === undefined
          ? {}
          : { currency: quote.currency_code }),
      });
    },
  };
}

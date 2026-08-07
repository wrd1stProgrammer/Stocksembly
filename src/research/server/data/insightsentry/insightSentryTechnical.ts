import { deriveTechnicalSnapshot } from "../market/alpacaMarketData";
import type {
  InsightSentryBarSet,
  InsightSentryQuote,
} from "./insightSentryMarket";

export type TechnicalTrend = "bullish" | "bearish" | "mixed";

export type InsightSentryTimeframeAnalysis = {
  readonly timeframe: "1h" | "4h" | "1d";
  readonly horizon: "short_term" | "medium_term" | "long_term";
  readonly trend: TechnicalTrend;
  readonly movingAverages: {
    readonly sma20?: number;
    readonly sma50?: number;
    readonly sma200?: number;
  };
  readonly rsi14?: number;
  readonly macd?: number;
  readonly macdSignal?: number;
  readonly atr14?: number;
  readonly volumeRatio20?: number;
  readonly support: number;
  readonly resistance: number;
  readonly bullishInvalidation: number;
  readonly bearishInvalidation: number;
  readonly coverage: InsightSentryBarSet["coverage"];
};

export type InsightSentryTechnicalAnalysis = {
  readonly quote: InsightSentryQuote;
  readonly timeframes: readonly [
    InsightSentryTimeframeAnalysis,
    InsightSentryTimeframeAnalysis,
    InsightSentryTimeframeAnalysis,
  ];
  readonly timeframeAgreement:
    | "agrees_bullish"
    | "agrees_bearish"
    | "disagrees";
};

function trend(input: {
  readonly latestClose: number;
  readonly sma20?: number;
  readonly sma50?: number;
  readonly macd?: number;
  readonly macdSignal?: number;
}): TechnicalTrend {
  const aboveAverages =
    input.sma20 !== undefined &&
    input.sma50 !== undefined &&
    input.latestClose > input.sma20 &&
    input.latestClose > input.sma50;
  const belowAverages =
    input.sma20 !== undefined &&
    input.sma50 !== undefined &&
    input.latestClose < input.sma20 &&
    input.latestClose < input.sma50;
  const positiveMacd =
    input.macd !== undefined &&
    input.macdSignal !== undefined &&
    input.macd > input.macdSignal;
  const negativeMacd =
    input.macd !== undefined &&
    input.macdSignal !== undefined &&
    input.macd < input.macdSignal;
  if (aboveAverages && positiveMacd) return "bullish";
  if (belowAverages && negativeMacd) return "bearish";
  return "mixed";
}

export function deriveInsightSentryTimeframeAnalysis(
  set: InsightSentryBarSet,
): InsightSentryTimeframeAnalysis {
  const snapshot = deriveTechnicalSnapshot(
    set.bars.map((bar) => ({
      t: bar.timestamp,
      o: bar.open,
      h: bar.high,
      l: bar.low,
      c: bar.close,
      v: bar.volume,
    })),
  );
  const window = set.bars.slice(-20);
  const support = Math.min(...window.map((bar) => bar.low));
  const resistance = Math.max(...window.map((bar) => bar.high));
  const atr = snapshot.atr14 ?? 0;
  return Object.freeze({
    timeframe: set.timeframe,
    horizon:
      set.timeframe === "1h"
        ? "short_term"
        : set.timeframe === "4h"
          ? "medium_term"
          : "long_term",
    trend: trend(snapshot),
    movingAverages: Object.freeze({
      ...(snapshot.sma20 === undefined ? {} : { sma20: snapshot.sma20 }),
      ...(snapshot.sma50 === undefined ? {} : { sma50: snapshot.sma50 }),
      ...(snapshot.sma200 === undefined ? {} : { sma200: snapshot.sma200 }),
    }),
    ...(snapshot.rsi14 === undefined ? {} : { rsi14: snapshot.rsi14 }),
    ...(snapshot.macd === undefined ? {} : { macd: snapshot.macd }),
    ...(snapshot.macdSignal === undefined
      ? {}
      : { macdSignal: snapshot.macdSignal }),
    ...(snapshot.atr14 === undefined ? {} : { atr14: snapshot.atr14 }),
    ...(snapshot.volumeRatio20 === undefined
      ? {}
      : { volumeRatio20: snapshot.volumeRatio20 }),
    support,
    resistance,
    bullishInvalidation: Number((support - atr).toFixed(4)),
    bearishInvalidation: Number((resistance + atr).toFixed(4)),
    coverage: set.coverage,
  });
}

export function deriveInsightSentryTechnicalAnalysis(input: {
  readonly quote: InsightSentryQuote;
  readonly bars: readonly [
    InsightSentryBarSet,
    InsightSentryBarSet,
    InsightSentryBarSet,
  ];
}): InsightSentryTechnicalAnalysis {
  const hourly = deriveInsightSentryTimeframeAnalysis(input.bars[0]);
  const fourHourly = deriveInsightSentryTimeframeAnalysis(input.bars[1]);
  const daily = deriveInsightSentryTimeframeAnalysis(input.bars[2]);
  const timeframeAgreement =
    hourly.trend === "bullish" &&
    fourHourly.trend === "bullish" &&
    daily.trend === "bullish"
      ? "agrees_bullish"
      : hourly.trend === "bearish" &&
          fourHourly.trend === "bearish" &&
          daily.trend === "bearish"
        ? "agrees_bearish"
        : "disagrees";
  return Object.freeze({
    quote: input.quote,
    timeframes: Object.freeze([hourly, fourHourly, daily] as const),
    timeframeAgreement,
  });
}

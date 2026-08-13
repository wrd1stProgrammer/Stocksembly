import { deriveInsightSentryTimeframeAnalysis } from "../../research/server/data/insightsentry/insightSentryTechnical";
import type {
  BriefingSignal,
  BriefingSourceSnapshot,
  BriefingTechnicalReference,
  BriefingWatchlistItem,
} from "../domain/contracts";
import {
  deriveBriefingMarketReference,
  hasReliableFourHourVolumeRatio,
} from "./briefingCollectionPolicy";
import type { BriefingCollectorResponses } from "./briefingCollectorClients";

function technicalReference(
  result: BriefingCollectorResponses["fourHourBars"],
  cutoffAt: string,
): BriefingTechnicalReference | undefined {
  if (result.status !== "fulfilled" || result.value.bars.length === 0)
    return undefined;
  const fourHourly = result.value;
  const analysis = deriveInsightSentryTimeframeAnalysis(fourHourly);
  const recentBars = fourHourly.bars.slice(-12);
  const current = recentBars.at(-1)?.close;
  const recentLow = Math.min(...recentBars.map((bar) => bar.low));
  const recentHigh = Math.max(...recentBars.map((bar) => bar.high));
  const averages = [
    analysis.movingAverages.sma20,
    analysis.movingAverages.sma50,
  ].filter((value): value is number => value !== undefined);
  const dynamicSupports =
    current === undefined ? [] : averages.filter((value) => value <= current);
  const dynamicResistances =
    current === undefined ? [] : averages.filter((value) => value >= current);
  return Object.freeze({
    timeframe: "4h",
    observedAt: fourHourly.coverage.observedEnd,
    barCount: fourHourly.coverage.barCount,
    trend: analysis.trend,
    ...(analysis.movingAverages.sma20 === undefined
      ? {}
      : { sma20: analysis.movingAverages.sma20 }),
    ...(analysis.movingAverages.sma50 === undefined
      ? {}
      : { sma50: analysis.movingAverages.sma50 }),
    ...(analysis.rsi14 === undefined ? {} : { rsi14: analysis.rsi14 }),
    ...(analysis.macd === undefined ? {} : { macd: analysis.macd }),
    ...(analysis.macdSignal === undefined
      ? {}
      : { macdSignal: analysis.macdSignal }),
    ...(analysis.atr14 === undefined ? {} : { atr14: analysis.atr14 }),
    ...(analysis.volumeRatio20 === undefined ||
    !hasReliableFourHourVolumeRatio({ bars: fourHourly, cutoffAt })
      ? {}
      : { volumeRatio20: analysis.volumeRatio20 }),
    support: Math.max(recentLow, ...dynamicSupports),
    resistance: Math.min(recentHigh, ...dynamicResistances),
  });
}

export function mapBriefingMarket(input: {
  readonly responses: BriefingCollectorResponses;
  readonly item: BriefingWatchlistItem;
  readonly marketDate: string;
  readonly cutoffAt: string;
}): {
  readonly quote: BriefingSourceSnapshot["quote"];
  readonly priceSignals: readonly BriefingSignal[];
  readonly marketReference?: BriefingSourceSnapshot["marketReference"];
  readonly technicalReference?: BriefingTechnicalReference;
  readonly limitations: readonly string[];
} {
  const { quote: quoteResult, dailyBars, fourHourBars } = input.responses;
  const limitations: string[] = [];
  if (quoteResult.status !== "fulfilled") limitations.push("quote");
  if (dailyBars.status !== "fulfilled") limitations.push("market_daily");
  if (fourHourBars.status !== "fulfilled") limitations.push("technical_4h");
  const quote =
    quoteResult.status === "fulfilled"
      ? {
          ...(quoteResult.value.lastPrice === undefined
            ? {}
            : { value: quoteResult.value.lastPrice }),
          ...(quoteResult.value.currency === undefined
            ? {}
            : { currency: quoteResult.value.currency }),
          ...(quoteResult.value.changePercent === undefined
            ? {}
            : { changePercent: quoteResult.value.changePercent }),
          marketState: quoteResult.value.marketState,
          ...(quoteResult.value.observedAt === undefined
            ? {}
            : { observedAt: quoteResult.value.observedAt }),
        }
      : {};
  const priceSignals: BriefingSignal[] =
    quoteResult.status === "fulfilled" &&
    quoteResult.value.changePercent !== undefined &&
    Math.abs(quoteResult.value.changePercent) >= 1
      ? [
          {
            id: `price:${input.marketDate}`,
            kind: "price",
            direction:
              quoteResult.value.changePercent > 0 ? "positive" : "negative",
            title: `${input.item.symbol} ${quoteResult.value.changePercent > 0 ? "+" : ""}${quoteResult.value.changePercent.toFixed(2)}%`,
            detail: `The latest ${quoteResult.value.marketState.toLowerCase()} quote moved ${Math.abs(quoteResult.value.changePercent).toFixed(2)}% from the previous close.`,
            investmentMeaning:
              "The move is actionable only if volume and the new information point in the same direction after the open.",
            occurredAt: quoteResult.value.observedAt ?? input.cutoffAt,
          },
        ]
      : [];
  const marketReference = deriveBriefingMarketReference(
    dailyBars.status === "fulfilled" ? dailyBars.value : undefined,
    input.marketDate,
    input.cutoffAt,
    quote,
  );
  const technical = technicalReference(fourHourBars, input.cutoffAt);
  return {
    quote,
    priceSignals,
    ...(marketReference === undefined ? {} : { marketReference }),
    ...(technical === undefined ? {} : { technicalReference: technical }),
    limitations,
  };
}

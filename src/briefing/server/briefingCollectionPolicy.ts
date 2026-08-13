import type { InsightSentryBarSet } from "../../research/server/data/insightsentry/insightSentryMarket";
import type { BriefingMarketReference } from "../domain/contracts";

const LOW_SIGNAL_ROUNDUP_TERMS =
  /earnings trends highlights|weekly earnings|market roundup|stocks? to watch|stocks? to buy|best stocks?|top stocks?|must[- ]own|for immediate release|장 마감 종합|오늘의 종목|주목할 종목/iu;
const PROMOTIONAL_NEWS_TERMS =
  /bull of the day|top pick|sponsored|promotion|promotional|recommendation|price[- ]target/iu;
const FOUR_HOUR_MILLISECONDS = 4 * 60 * 60 * 1_000;

export function isLowSignalBriefingNewsTitle(title: string): boolean {
  return LOW_SIGNAL_ROUNDUP_TERMS.test(title);
}

export function isAdmissibleBriefingNewsTitle(title: string): boolean {
  return (
    !isLowSignalBriefingNewsTitle(title) && !PROMOTIONAL_NEWS_TERMS.test(title)
  );
}

export function hasReliableFourHourVolumeRatio(input: {
  readonly bars: InsightSentryBarSet;
  readonly cutoffAt: string;
}): boolean {
  const latest = input.bars.bars.at(-1);
  return (
    input.bars.timeframe === "4h" &&
    !input.bars.coverage.partial &&
    input.bars.bars.length >= 20 &&
    latest !== undefined &&
    Date.parse(latest.timestamp) + FOUR_HOUR_MILLISECONDS <=
      Date.parse(input.cutoffAt)
  );
}

export function deriveBriefingMarketReference(
  daily: InsightSentryBarSet | undefined,
  marketDate: string,
  cutoffAt: string,
  quote?: { readonly value?: number; readonly marketState?: string },
): BriefingMarketReference | undefined {
  if (daily === undefined) return undefined;
  const bars = daily.bars
    .filter(
      (bar) =>
        Date.parse(bar.timestamp) <= Date.parse(cutoffAt) &&
        bar.timestamp.slice(0, 10) < marketDate,
    )
    .slice(-20);
  const previous = bars.at(-1);
  if (previous === undefined) return undefined;
  const averageVolume20d =
    bars.length < 5
      ? undefined
      : bars.reduce((total, bar) => total + bar.volume, 0) / bars.length;
  const premarketGapPercent =
    quote?.marketState === "PRE" &&
    quote.value !== undefined &&
    previous.close > 0
      ? Number(((quote.value / previous.close - 1) * 100).toFixed(2))
      : undefined;
  return Object.freeze({
    previousClose: previous.close,
    previousHigh: previous.high,
    previousLow: previous.low,
    ...(averageVolume20d === undefined ? {} : { averageVolume20d }),
    high20d: Math.max(...bars.map((bar) => bar.high)),
    low20d: Math.min(...bars.map((bar) => bar.low)),
    ...(premarketGapPercent === undefined ? {} : { premarketGapPercent }),
  });
}

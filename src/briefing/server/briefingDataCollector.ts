import { createInsightSentryClient } from "../../research/server/data/insightsentry/insightSentryClient";
import { loadInsightSentryConfig } from "../../research/server/data/insightsentry/insightSentryConfig";
import {
  createInsightSentryMarket,
  type InsightSentryBarSet,
} from "../../research/server/data/insightsentry/insightSentryMarket";
import { createInsightSentryResearchDataAdapter } from "../../research/server/data/insightsentry/insightSentryResearchData";
import { createSemanticNewsClassifier } from "../../research/server/data/insightsentry/insightSentrySemanticNewsClassifier";
import { deriveInsightSentryTimeframeAnalysis } from "../../research/server/data/insightsentry/insightSentryTechnical";
import type {
  BriefingEarningsSnapshot,
  BriefingFundamentalPoint,
  BriefingMarketReference,
  BriefingSignal,
  BriefingSource,
  BriefingSourceSnapshot,
  BriefingTechnicalReference,
  BriefingUpcomingEvent,
  BriefingWatchlistItem,
} from "../domain/contracts";

const FUNDAMENTAL_SERIES = [
  "total_revenue_fq",
  "gross_margin_fq",
  "operating_margin_fq",
  "free_cash_flow_fq",
  "earnings_per_share_diluted_fq",
] as const;

const FUNDAMENTAL_KEYS = new Set([
  "total_revenue_ttm",
  "revenue_one_year_growth_ttm",
  "gross_margin_ttm",
  "operating_margin_fq",
  "net_margin_ttm",
  "free_cash_flow_ttm",
  "market_cap_basic",
  "price_earnings",
  "price_earnings_forward_fq",
  "enterprise_value_ebitda_fq",
  "return_on_equity_ttm",
  "return_on_invested_capital_fq",
  "price_target_average",
  "revenue_estimate_ntm",
  "eps_estimate_ntm",
]);

function meaningFor(
  category: BriefingSignal["kind"],
  direction: BriefingSignal["direction"],
): string {
  if (category === "risk")
    return "This can change the downside distribution before it changes reported earnings.";
  if (category === "market")
    return "Read it through relative demand and the valuation multiple, not as a company-only signal.";
  if (direction === "positive")
    return "The signal matters only if it lifts the next revenue, margin, or cash-flow checkpoint.";
  if (direction === "negative")
    return "The signal raises the burden on the next operating result and guidance update.";
  return "The investment impact depends on whether the next filing confirms a measurable operating change.";
}

const LOCAL_FLOW_TERMS =
  /(?:korea|korean|south korea|한국|국내).{0,80}(?:retail|investor|fund|etf|leverag|net buy|net sell|flow|position|개인|투자자|펀드|레버리지|순매수|순매도|수급)|(?:retail|investor|fund|etf|leverag|net buy|net sell|flow|position|개인|투자자|펀드|레버리지|순매수|순매도|수급).{0,80}(?:korea|korean|south korea|한국|국내)/iu;
const OPERATING_LINK_TERMS =
  /revenue|sales|shipment|order|contract|factory|production|pricing|selling price|product price|margin|approval|license|partnership|launch|delivery|매출|판매|출하|수주|계약|공장|생산|제품 가격|판매 가격|마진|승인|라이선스|파트너십|출시|인도/iu;

function isIssuerRelevantSignal(title: string, detail: string): boolean {
  const text = `${title} ${detail}`;
  if (!LOCAL_FLOW_TERMS.test(text)) return true;
  return OPERATING_LINK_TERMS.test(text);
}

const LOW_SIGNAL_ROUNDUP_TERMS =
  /earnings trends highlights|weekly earnings|market roundup|stocks? to watch|top stocks?|for immediate release|장 마감 종합|오늘의 종목|주목할 종목/iu;

function cleanNewsText(value: string): string {
  return value
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replaceAll(/[*_#>`]/gu, "")
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function titleTerms(value: string): ReadonlySet<string> {
  return new Set(
    cleanNewsText(value)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 3),
  );
}

function titleSimilarity(left: string, right: string): number {
  const a = titleTerms(left);
  const b = titleTerms(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const term of a) if (b.has(term)) overlap += 1;
  return overlap / Math.min(a.size, b.size);
}

function uniqueNewsEvents<T extends { readonly title: string }>(
  values: readonly T[],
): readonly T[] {
  const selected: T[] = [];
  for (const value of values) {
    if (
      selected.some(
        (candidate) => titleSimilarity(candidate.title, value.title) >= 0.62,
      )
    )
      continue;
    selected.push(value);
  }
  return selected;
}

function earningsCertainty(
  reportAt: string,
  cutoffAt: string,
): "confirmed" | "estimated" {
  const scheduled = new Date(reportAt);
  const leadDays =
    (scheduled.getTime() - Date.parse(cutoffAt)) / (24 * 60 * 60 * 1_000);
  const providerPlaceholderTime =
    scheduled.getUTCHours() === 12 &&
    scheduled.getUTCMinutes() === 0 &&
    scheduled.getUTCSeconds() === 0;
  return leadDays > 0 && leadDays <= 45 && !providerPlaceholderTime
    ? "confirmed"
    : "estimated";
}

function toSource(event: {
  readonly title: string;
  readonly source?: string;
  readonly publishedAt: string;
  readonly link?: string;
}): BriefingSource | undefined {
  if (event.link === undefined) return undefined;
  return {
    title: event.title,
    publisher: event.source ?? new URL(event.link).hostname,
    publishedAt: event.publishedAt,
    url: event.link,
  };
}

function uniqueBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): readonly T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function coverageStart(cutoffAt: string, previousBriefingAt?: string): string {
  const cutoff = Date.parse(cutoffAt);
  const previous =
    previousBriefingAt === undefined
      ? Number.NaN
      : Date.parse(previousBriefingAt);
  const elapsed = cutoff - previous;
  if (
    Number.isFinite(previous) &&
    previous < cutoff &&
    elapsed <= 5 * 24 * 60 * 60 * 1_000
  )
    return new Date(previous).toISOString();
  return new Date(cutoff - 24 * 60 * 60 * 1_000).toISOString();
}

function marketReference(
  daily: InsightSentryBarSet | undefined,
  cutoffAt: string,
  quote?: { readonly value?: number; readonly marketState?: string },
): BriefingMarketReference | undefined {
  if (daily === undefined) return undefined;
  const bars = daily.bars
    .filter((bar) => Date.parse(bar.timestamp) <= Date.parse(cutoffAt))
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

function technicalReference(
  fourHourly: InsightSentryBarSet | undefined,
): BriefingTechnicalReference | undefined {
  if (fourHourly === undefined || fourHourly.bars.length < 20) return undefined;
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
  const support = Math.max(recentLow, ...dynamicSupports);
  const resistance = Math.min(recentHigh, ...dynamicResistances);
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
    ...(analysis.volumeRatio20 === undefined
      ? {}
      : { volumeRatio20: analysis.volumeRatio20 }),
    support,
    resistance,
  });
}

function fundamentalSeries(
  series:
    | readonly {
        readonly id: string;
        readonly points: readonly Readonly<Record<string, number>>[];
      }[]
    | undefined,
): Readonly<Record<string, readonly BriefingFundamentalPoint[]>> {
  return Object.freeze(
    Object.fromEntries(
      (series ?? []).flatMap((item) => {
        const points = item.points.slice(-12).flatMap((point) => {
          const value = Object.entries(point).find(
            ([key, candidate]) => key !== "time" && Number.isFinite(candidate),
          )?.[1];
          // biome-ignore lint/complexity/useLiteralKeys: provider series uses an index signature.
          const time = point["time"];
          if (value === undefined || time === undefined) return [];
          const observedAt = new Date(
            time >= 100_000_000_000 ? time : time * 1_000,
          ).toISOString();
          return [Object.freeze({ observedAt, value })];
        });
        return points.length === 0
          ? []
          : [[item.id, Object.freeze(points)] as const];
      }),
    ),
  );
}

function mergeEarnings(
  primary: BriefingEarningsSnapshot | undefined,
  fallback: BriefingEarningsSnapshot | undefined,
): BriefingEarningsSnapshot | undefined {
  if (primary === undefined && fallback === undefined) return undefined;
  const merged = Object.fromEntries(
    Object.entries({ ...fallback, ...primary }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as BriefingEarningsSnapshot;
  return Object.keys(merged).length === 0 ? undefined : Object.freeze(merged);
}

const COMPANY_SUFFIXES = new Set([
  "corp",
  "corporation",
  "company",
  "inc",
  "incorporated",
  "limited",
  "ltd",
  "plc",
]);

function referencesTrackedCompany(
  item: BriefingWatchlistItem,
  title: string,
  detail: string,
): boolean {
  const haystack = `${title} ${detail}`.toLowerCase();
  const tickerPattern = new RegExp(
    `(^|[^a-z0-9])${item.symbol.toLowerCase().replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}([^a-z0-9]|$)`,
    "u",
  );
  if (tickerPattern.test(haystack)) return true;
  return item.company
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((term) => term.length >= 4 && !COMPANY_SUFFIXES.has(term))
    .some((term) =>
      new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, "u").test(haystack),
    );
}

export type BriefingDataCollector = {
  readonly collect: (input: {
    readonly item: BriefingWatchlistItem;
    readonly marketDate: string;
    readonly cutoffAt: string;
    readonly previousEventKeys: readonly string[];
    readonly previousBriefingAt?: string;
  }) => Promise<BriefingSourceSnapshot>;
};

export function createBriefingDataCollector(input: {
  readonly dataRoot: string;
}): BriefingDataCollector {
  const client = createInsightSentryClient({
    configuration: loadInsightSentryConfig(),
    dataRoot: input.dataRoot,
  });
  const market = createInsightSentryMarket(client);
  const research = createInsightSentryResearchDataAdapter({
    client,
    dataRoot: input.dataRoot,
    rollout: {
      fundamentals: true,
      news: true,
      documents: true,
      calendar: true,
      peers: false,
      options: false,
    },
    classifyNews: createSemanticNewsClassifier(),
    screenPeers: async () => {
      throw new TypeError("briefing_peer_screen_not_requested");
    },
  });

  return {
    async collect({
      item,
      marketDate,
      cutoffAt,
      previousEventKeys,
      previousBriefingAt,
    }) {
      const startAt = coverageStart(cutoffAt, previousBriefingAt);
      const newsRecentDays = Math.min(
        5,
        Math.max(
          1,
          Math.ceil(
            (Date.parse(cutoffAt) - Date.parse(startAt)) /
              (24 * 60 * 60 * 1_000),
          ),
        ),
      );
      const [
        quoteResult,
        dailyBarsResult,
        fourHourBarsResult,
        companyInfoResult,
        news,
        documents,
        calendar,
        fundamentals,
      ] = await Promise.allSettled([
        market.quote(item.providerCode),
        market.comparisonDailyBars(item.providerCode),
        market.fourHourBars(item.providerCode),
        market.companyInfo(item.providerCode),
        research.news({
          symbol: item.providerCode,
          companyName: item.company,
          asOf: cutoffAt,
          existingEventKeys: previousEventKeys,
          recentDays: newsRecentDays,
          allowArchiveFallback: false,
          collectionMode: "briefing",
        }),
        research.documents({ symbol: item.providerCode, asOf: cutoffAt }),
        research.calendar({ symbol: item.providerCode, asOf: cutoffAt }),
        research.fundamentals({
          symbol: item.providerCode,
          asOf: cutoffAt,
          seriesIndicatorIds: FUNDAMENTAL_SERIES,
          periods: 12,
        }),
      ]);

      const limitations: string[] = [];
      if (quoteResult.status !== "fulfilled") limitations.push("quote");
      if (fourHourBarsResult.status !== "fulfilled")
        limitations.push("technical_4h");
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

      const newsData =
        news.status === "fulfilled" && news.value.status === "available"
          ? news.value.data
          : undefined;
      if (newsData === undefined) limitations.push("news");
      const newsEvents = uniqueNewsEvents(
        (newsData?.events ?? []).filter((event) => {
          const detail =
            newsData?.excerpts.find(
              (excerpt) => excerpt.eventKey === event.eventKey,
            )?.content ?? event.title;
          return (
            Date.parse(event.publishedAt) >= Date.parse(startAt) &&
            Date.parse(event.publishedAt) <= Date.parse(cutoffAt) &&
            referencesTrackedCompany(item, event.title, detail) &&
            isIssuerRelevantSignal(event.title, detail) &&
            !LOW_SIGNAL_ROUNDUP_TERMS.test(event.title)
          );
        }),
      );
      const newsSignals: BriefingSignal[] = newsEvents
        .slice(0, 5)
        .map((event) => {
          const excerpt =
            newsData?.excerpts.find(
              (candidate) => candidate.eventKey === event.eventKey,
            )?.content ?? event.title;
          return {
            id: event.eventKey,
            kind: event.category,
            direction: event.direction,
            title: cleanNewsText(event.title),
            detail: cleanNewsText(excerpt).slice(0, 520),
            investmentMeaning: meaningFor(event.category, event.direction),
            occurredAt: event.publishedAt,
            ...(event.link === undefined ? {} : { sourceUrl: event.link }),
          };
        });

      const documentData =
        documents.status === "fulfilled" &&
        documents.value.status === "available"
          ? documents.value.data
          : undefined;
      if (documentData === undefined) limitations.push("documents");
      const documentSignals: BriefingSignal[] = (documentData?.documents ?? [])
        .filter(
          (document) =>
            Date.parse(document.publishedAt) >= Date.parse(startAt) &&
            Date.parse(document.publishedAt) <= Date.parse(cutoffAt),
        )
        .slice(0, 2)
        .map((document) => ({
          id: `document:${document.id}`,
          kind: "company",
          direction: "neutral",
          title: document.title,
          detail: `${document.category} · ${document.content.slice(0, 360).replaceAll(/\s+/gu, " ")}`,
          investmentMeaning:
            "A new primary document can alter the operating evidence before market commentary catches up.",
          occurredAt: document.publishedAt,
        }));

      const priceSignals: BriefingSignal[] =
        quoteResult.status === "fulfilled" &&
        quoteResult.value.changePercent !== undefined &&
        Math.abs(quoteResult.value.changePercent) >= 1
          ? [
              {
                id: `price:${marketDate}`,
                kind: "price",
                direction:
                  quoteResult.value.changePercent > 0 ? "positive" : "negative",
                title: `${item.symbol} ${quoteResult.value.changePercent > 0 ? "+" : ""}${quoteResult.value.changePercent.toFixed(2)}%`,
                detail: `The latest ${quoteResult.value.marketState.toLowerCase()} quote moved ${Math.abs(quoteResult.value.changePercent).toFixed(2)}% from the previous close.`,
                investmentMeaning:
                  "The move is actionable only if volume and the new information point in the same direction after the open.",
                occurredAt: quoteResult.value.observedAt ?? cutoffAt,
              },
            ]
          : [];

      const calendarData =
        calendar.status === "fulfilled" && calendar.value.status === "available"
          ? calendar.value.data
          : undefined;
      if (calendarData === undefined) limitations.push("calendar");
      const mergedEarnings = mergeEarnings(
        calendarData?.earnings,
        companyInfoResult.status === "fulfilled"
          ? companyInfoResult.value.earnings
          : undefined,
      );
      const earnings =
        mergedEarnings?.nextReportAt === undefined
          ? mergedEarnings
          : Object.freeze({
              ...mergedEarnings,
              nextReportCertainty: earningsCertainty(
                mergedEarnings.nextReportAt,
                cutoffAt,
              ),
            });
      const calendarEnd = Date.parse(cutoffAt) + 90 * 24 * 60 * 60 * 1_000;
      const calendarEvents: BriefingUpcomingEvent[] = (
        calendarData?.events ?? []
      )
        .filter(
          (event) =>
            Date.parse(event.reportAt) > Date.parse(cutoffAt) &&
            Date.parse(event.reportAt) <= calendarEnd,
        )
        .slice(0, 3)
        .map((event) => ({
          name: `${item.symbol} earnings`,
          scheduledAt: event.reportAt,
          whyItMatters:
            "The release resets the market's revenue, margin, and forward-guidance assumptions.",
          certainty: earningsCertainty(event.reportAt, cutoffAt),
        }));
      const fallbackEarningsEvent =
        earnings?.nextReportAt !== undefined &&
        Date.parse(earnings.nextReportAt) > Date.parse(cutoffAt) &&
        Date.parse(earnings.nextReportAt) <= calendarEnd &&
        !calendarEvents.some(
          (event) => event.scheduledAt === earnings.nextReportAt,
        )
          ? [
              {
                name: `${item.symbol} earnings`,
                scheduledAt: earnings.nextReportAt,
                whyItMatters:
                  earnings.nextEpsForecast === undefined
                    ? "The release resets revenue, margin, and forward-guidance assumptions."
                    : `The current next-quarter EPS consensus is ${earnings.nextEpsForecast.toFixed(2)}; the release tests whether growth and margin can defend it.`,
                certainty: earnings.nextReportCertainty ?? "estimated",
              },
            ]
          : [];
      const upcomingEvents = [...calendarEvents, ...fallbackEarningsEvent]
        .sort(
          (left, right) =>
            Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt),
        )
        .slice(0, 3);

      const fundamentalData =
        fundamentals.status === "fulfilled" &&
        fundamentals.value.status === "available"
          ? fundamentals.value.data
          : undefined;
      if (fundamentalData === undefined) limitations.push("fundamentals");
      const selectedFundamentals = Object.fromEntries(
        (fundamentalData?.indicators ?? []).flatMap((indicator) =>
          FUNDAMENTAL_KEYS.has(indicator.id) &&
          (typeof indicator.value === "number" ||
            typeof indicator.value === "string")
            ? [[indicator.id, indicator.value] as const]
            : [],
        ),
      );
      const selectedFundamentalSeries = fundamentalSeries(
        fundamentalData?.series,
      );

      const reference = marketReference(
        dailyBarsResult.status === "fulfilled"
          ? dailyBarsResult.value
          : undefined,
        cutoffAt,
        quote,
      );
      const technical = technicalReference(
        fourHourBarsResult.status === "fulfilled"
          ? fourHourBarsResult.value
          : undefined,
      );

      const sources = uniqueBy(
        newsEvents.flatMap((event) => {
          const source = toSource(event);
          return source === undefined ? [] : [source];
        }),
        (source) => source.url,
      );
      const editorialSignals = uniqueBy(
        [...newsSignals, ...documentSignals],
        (signal) => signal.id,
      );
      const reservedPriceSignals = priceSignals.slice(0, 1);
      const signals = Object.freeze([
        ...editorialSignals.slice(0, 6 - reservedPriceSignals.length),
        ...reservedPriceSignals,
      ]);

      return Object.freeze({
        symbol: item.symbol,
        company: item.company,
        providerCode: item.providerCode,
        marketDate,
        cutoffAt,
        coverageStart: startAt,
        quote,
        signals: Object.freeze(signals),
        upcomingEvents: Object.freeze(upcomingEvents),
        fundamentals: Object.freeze(selectedFundamentals),
        fundamentalSeries: selectedFundamentalSeries,
        ...(reference === undefined ? {} : { marketReference: reference }),
        ...(technical === undefined ? {} : { technicalReference: technical }),
        ...(earnings === undefined ? {} : { earnings }),
        sources: Object.freeze(sources),
        limitations: Object.freeze([...new Set(limitations)]),
      });
    },
  };
}

import { createInsightSentryClient } from "../../research/server/data/insightsentry/insightSentryClient";
import { loadInsightSentryConfig } from "../../research/server/data/insightsentry/insightSentryConfig";
import { createInsightSentryMarket } from "../../research/server/data/insightsentry/insightSentryMarket";
import type {
  NewsClassifier,
  NewsClassifierCandidate,
} from "../../research/server/data/insightsentry/insightSentryResearchContracts";
import { createInsightSentryResearchDataAdapter } from "../../research/server/data/insightsentry/insightSentryResearchData";
import type {
  BriefingSignal,
  BriefingSource,
  BriefingSourceSnapshot,
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

function classifier(): NewsClassifier {
  return async (request) => ({
    classifications: request.candidates.map((candidate) =>
      classifyCandidate(candidate),
    ),
  });
}

function classifyCandidate(candidate: NewsClassifierCandidate) {
  const text =
    `${candidate.title} ${candidate.clusterFeatures.topics.join(" ")}`.toLowerCase();
  const category =
    /regulat|lawsuit|probe|investigation|sanction|recall|breach|risk/u.test(
      text,
    )
      ? "risk"
      : /rate|inflation|economy|market|sector|index|tariff/u.test(text)
        ? "market"
        : "company";
  const material =
    candidate.source !== undefined &&
    candidate.link !== undefined &&
    /earn|guidance|forecast|contract|launch|approval|regulat|lawsuit|acqui|merger|partnership|layoff|buyback|dividend|tariff|shipment|sales|revenue|margin|ceo|cfo/u.test(
      text,
    );
  return {
    candidateId: candidate.candidateId,
    eventKey: candidate.clusterId.slice(0, 160),
    category,
    relevance: material ? 0.9 : 0.68,
    materiality: material ? "material" : "immaterial",
    novelty: "unique",
    direction: candidate.clusterFeatures.stance,
    horizon: /today|pre.?market|after.?hours|immediate/u.test(text)
      ? "immediate"
      : "near_term",
    verificationNeed: "recommended",
  };
}

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

function coverageStart(cutoffAt: string): string {
  return new Date(Date.parse(cutoffAt) - 24 * 60 * 60 * 1_000).toISOString();
}

export type BriefingDataCollector = {
  readonly collect: (input: {
    readonly item: BriefingWatchlistItem;
    readonly marketDate: string;
    readonly cutoffAt: string;
    readonly previousEventKeys: readonly string[];
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
    rollout: {
      fundamentals: true,
      news: true,
      documents: true,
      calendar: true,
      peers: false,
      options: false,
    },
    classifyNews: classifier(),
    screenPeers: async () => {
      throw new TypeError("briefing_peer_screen_not_requested");
    },
  });

  return {
    async collect({ item, marketDate, cutoffAt, previousEventKeys }) {
      const startAt = coverageStart(cutoffAt);
      const [quoteResult, news, documents, calendar, fundamentals] =
        await Promise.allSettled([
          market.quote(item.providerCode),
          research.news({
            symbol: item.providerCode,
            companyName: item.company,
            asOf: cutoffAt,
            existingEventKeys: previousEventKeys,
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
      const newsEvents = (newsData?.events ?? []).filter(
        (event) =>
          Date.parse(event.publishedAt) >= Date.parse(startAt) &&
          Date.parse(event.publishedAt) <= Date.parse(cutoffAt),
      );
      const newsSignals: BriefingSignal[] = newsEvents
        .slice(0, 5)
        .map((event) => ({
          id: event.eventKey,
          kind: event.category,
          direction: event.direction,
          title: event.title,
          detail:
            newsData?.excerpts.find(
              (excerpt) => excerpt.eventKey === event.eventKey,
            )?.content ?? event.title,
          investmentMeaning: meaningFor(event.category, event.direction),
          occurredAt: event.publishedAt,
          ...(event.link === undefined ? {} : { sourceUrl: event.link }),
        }));

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
      const calendarEnd = Date.parse(cutoffAt) + 14 * 24 * 60 * 60 * 1_000;
      const upcomingEvents: BriefingUpcomingEvent[] = (
        calendarData?.events ?? []
      )
        .filter(
          (event) =>
            Date.parse(event.reportAt) > Date.parse(cutoffAt) &&
            Date.parse(event.reportAt) <= calendarEnd,
        )
        .slice(0, 3)
        .map((event) => ({
          name: event.name || `${item.symbol} earnings`,
          scheduledAt: event.reportAt,
          whyItMatters:
            "The release resets the market's revenue, margin, and forward-guidance assumptions.",
        }));

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

      const sources = uniqueBy(
        newsEvents.flatMap((event) => {
          const source = toSource(event);
          return source === undefined ? [] : [source];
        }),
        (source) => source.url,
      );
      const signals = uniqueBy(
        [...newsSignals, ...documentSignals, ...priceSignals],
        (signal) => signal.id,
      ).slice(0, 6);

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
        sources: Object.freeze(sources),
        limitations: Object.freeze([...new Set(limitations)]),
      });
    },
  };
}

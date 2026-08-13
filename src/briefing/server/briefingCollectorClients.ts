import { createInsightSentryClient } from "../../research/server/data/insightsentry/insightSentryClient";
import { loadInsightSentryConfig } from "../../research/server/data/insightsentry/insightSentryConfig";
import {
  createInsightSentryMarket,
  type InsightSentryBarSet,
  type InsightSentryCompanyInfo,
  type InsightSentryQuote,
} from "../../research/server/data/insightsentry/insightSentryMarket";
import type {
  CalendarDataset,
  DocumentsDataset,
  FamilyResult,
  FundamentalsDataset,
  NewsDataset,
} from "../../research/server/data/insightsentry/insightSentryResearchContracts";
import { createInsightSentryResearchDataAdapter } from "../../research/server/data/insightsentry/insightSentryResearchData";
import { createSemanticNewsClassifier } from "../../research/server/data/insightsentry/insightSentrySemanticNewsClassifier";
import type { BriefingWatchlistItem } from "../domain/contracts";

const FUNDAMENTAL_SERIES = [
  "total_revenue_fq",
  "gross_margin_fq",
  "operating_margin_fq",
  "free_cash_flow_fq",
  "earnings_per_share_diluted_fq",
] as const;

export type BriefingCollectorResponses = {
  readonly quote: PromiseSettledResult<InsightSentryQuote>;
  readonly dailyBars: PromiseSettledResult<InsightSentryBarSet>;
  readonly fourHourBars: PromiseSettledResult<InsightSentryBarSet>;
  readonly companyInfo: PromiseSettledResult<InsightSentryCompanyInfo>;
  readonly news: PromiseSettledResult<FamilyResult<NewsDataset>>;
  readonly documents: PromiseSettledResult<FamilyResult<DocumentsDataset>>;
  readonly calendar: PromiseSettledResult<FamilyResult<CalendarDataset>>;
  readonly fundamentals: PromiseSettledResult<
    FamilyResult<FundamentalsDataset>
  >;
};

export type BriefingCollectorClients = {
  readonly collect: (input: {
    readonly item: BriefingWatchlistItem;
    readonly cutoffAt: string;
    readonly startAt: string;
    readonly previousEventKeys: readonly string[];
  }) => Promise<BriefingCollectorResponses>;
};

export function createBriefingCollectorClients(input: {
  readonly dataRoot: string;
}): BriefingCollectorClients {
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
    async collect({ item, cutoffAt, startAt, previousEventKeys }) {
      const recentDays = Math.min(
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
        quote,
        dailyBars,
        fourHourBars,
        companyInfo,
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
          recentDays,
          allowArchiveFallback: false,
          collectionMode: "briefing",
        }),
        research.documents({
          symbol: item.providerCode,
          asOf: cutoffAt,
          collectionMode: "briefing",
        }),
        research.calendar({ symbol: item.providerCode, asOf: cutoffAt }),
        research.fundamentals({
          symbol: item.providerCode,
          asOf: cutoffAt,
          seriesIndicatorIds: FUNDAMENTAL_SERIES,
          periods: 12,
        }),
      ]);
      return {
        quote,
        dailyBars,
        fourHourBars,
        companyInfo,
        news,
        documents,
        calendar,
        fundamentals,
      };
    },
  };
}

import type { InsightSentryClient } from "./insightSentryClient";

export const INSIGHTSENTRY_RESEARCH_FAMILIES = [
  "fundamentals",
  "news",
  "documents",
  "calendar",
  "peers",
  "options",
] as const;
export type InsightSentryResearchFamily =
  (typeof INSIGHTSENTRY_RESEARCH_FAMILIES)[number];

export type InsightSentryResearchRollout = Readonly<
  Record<InsightSentryResearchFamily, boolean>
>;

export type FamilyLimitation =
  | "rollout_disabled"
  | "not_entitled"
  | "not_needed"
  | "provider_unavailable"
  | "provider_stale";

export type FamilyResult<T> =
  | { readonly status: "available"; readonly data: T }
  | { readonly status: "stale"; readonly limitation: "provider_stale" }
  | {
      readonly status: "unavailable";
      readonly limitation: "provider_unavailable";
    }
  | {
      readonly status: "withheld";
      readonly limitation: "rollout_disabled" | "not_entitled" | "not_needed";
    };

export type ProviderTimestamps = {
  readonly providerUpdatedAt: string;
  readonly retrievedAt: string;
};

export type PitUnsafeDataset = ProviderTimestamps & {
  readonly pitSafe: false;
  readonly limitations: readonly ["provider_dataset_not_point_in_time_safe"];
};

export interface FundamentalValueObject {
  readonly [key: string]: FundamentalValue;
}

export interface FundamentalValueArray
  extends ReadonlyArray<FundamentalValue> {}

export type FundamentalValue =
  | number
  | string
  | boolean
  | null
  | FundamentalValueArray
  | FundamentalValueObject;

export type FundamentalIndicator = {
  readonly id: string;
  readonly name?: string;
  readonly category?: string;
  readonly period?: string;
  readonly value: FundamentalValue;
};

export type FundamentalSeries = {
  readonly id: string;
  readonly name: string;
  readonly points: readonly Readonly<Record<string, number>>[];
};

export type FundamentalsDataset = PitUnsafeDataset & {
  readonly symbol: string;
  readonly indicators: readonly FundamentalIndicator[];
  readonly series: readonly FundamentalSeries[];
  readonly unavailableSeriesIds: readonly string[];
};

export const NEWS_CLASSIFIER_MODEL = "gpt-5.6-luna" as const;
export const NEWS_CLASSIFIER_REASONING = "low" as const;

export type NewsClassifierCandidate = {
  readonly candidateId: string;
  readonly clusterId: string;
  readonly bundleSize: number;
  readonly title: string;
  readonly alternateTitles: readonly string[];
  readonly sources: readonly string[];
  readonly publishedAt: string;
  readonly source?: string;
  readonly link?: string;
  readonly excerpt?: string;
  readonly clusterFeatures: {
    readonly entities: readonly string[];
    readonly topics: readonly string[];
    readonly timeBucket: string;
    readonly sources: readonly string[];
    readonly stance: "positive" | "negative" | "neutral";
  };
};

export type NewsClassifierRequest = {
  readonly model: typeof NEWS_CLASSIFIER_MODEL;
  readonly reasoning: typeof NEWS_CLASSIFIER_REASONING;
  readonly phase: "shortlist" | "detail";
  readonly candidates: readonly NewsClassifierCandidate[];
};

export type NewsClassifier = (
  request: NewsClassifierRequest,
) => Promise<unknown>;

export type NewsEventCard = {
  readonly eventKey: string;
  readonly category: "company" | "market" | "risk";
  readonly teamRelevance: readonly (
    | "market"
    | "company"
    | "financial"
    | "risk"
  )[];
  readonly relevance: number;
  readonly direction: "positive" | "negative" | "mixed" | "neutral";
  readonly horizon: "immediate" | "near_term" | "long_term";
  readonly verificationNeed: "required" | "recommended" | "none";
  readonly title: string;
  readonly publishedAt: string;
  readonly source?: string;
  readonly link?: string;
};

export type NewsExcerpt = {
  readonly eventKey: string;
  readonly content: string;
};

export type NewsDataset = PitUnsafeDataset & {
  readonly symbol: string;
  readonly providerCalls: number;
  readonly rawItemCount: number;
  readonly events: readonly NewsEventCard[];
  readonly excerpts: readonly NewsExcerpt[];
  readonly providerEvidence: readonly string[];
};

export type DocumentRecord = {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly reportedAt: string;
  readonly publishedAt: string;
  readonly content: string;
};

export type DocumentsDataset = PitUnsafeDataset & {
  readonly symbol: string;
  readonly documents: readonly DocumentRecord[];
};

export type CalendarEvent = {
  readonly symbol: string;
  readonly name: string;
  readonly reportAt: string;
};

export type EarningsSnapshot = {
  readonly latestReportAt?: string;
  readonly nextReportAt?: string;
  readonly currency?: string;
  readonly epsActual?: number;
  readonly epsForecast?: number;
  readonly epsSurprise?: number;
  readonly epsSurprisePercent?: number;
  readonly nextEpsForecast?: number;
  readonly revenueActual?: number;
  readonly revenueForecast?: number;
  readonly revenueSurprise?: number;
  readonly revenueSurprisePercent?: number;
  readonly nextRevenueForecast?: number;
};

export type CalendarDataset = PitUnsafeDataset & {
  readonly symbol: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly events: readonly CalendarEvent[];
  readonly earnings?: EarningsSnapshot;
};

export type PeerRecord = {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string;
  readonly classification: "direct_competitor" | "operating_comparable";
  readonly selectionScore: number;
  readonly selectionReasons: readonly string[];
  readonly marketCap?: number;
  readonly priceEarningsTtm?: number;
  readonly enterpriseValueEbitdaTtm?: number;
  readonly enterpriseValueRevenueTtm?: number;
  readonly revenueGrowthTtm?: number;
  readonly grossMarginTtm?: number;
  readonly operatingMarginTtm?: number;
  readonly performance3Month?: number;
  readonly performance1Year?: number;
};

export type PeerSubjectMetrics = Omit<
  PeerRecord,
  "classification" | "selectionScore" | "selectionReasons"
>;

export type RelativeValuationMetric = {
  readonly metric:
    | "price_earnings_ttm"
    | "enterprise_value_ebitda_ttm"
    | "enterprise_value_to_revenue_ttm";
  readonly peerMedian: number;
  readonly peerCount: number;
  readonly subjectValue?: number;
  readonly premiumDiscountPercent?: number;
};

export type PeerScreen = (input: {
  readonly symbol: string;
  readonly limit: number;
}) => Promise<unknown>;

export type PeersDataset = ProviderTimestamps & {
  readonly symbol: string;
  readonly sector: string;
  readonly selectorVersion: string;
  readonly selectionCache: "hit" | "miss";
  readonly subject: PeerSubjectMetrics;
  readonly relativeValuation: readonly RelativeValuationMetric[];
  readonly peers: readonly PeerRecord[];
};

export type OptionRecord = {
  readonly code: string;
  readonly expiration: string;
  readonly type: "CALL" | "PUT";
  readonly strikePrice: number;
};

export type OptionsDataset = ProviderTimestamps & {
  readonly symbol: string;
  readonly contracts: readonly OptionRecord[];
};

export type InsightSentryResearchDataAdapter = {
  readonly fundamentals: (input: {
    readonly symbol: string;
    readonly asOf: string;
    readonly seriesIndicatorIds: readonly string[];
    readonly periods: number;
  }) => Promise<FamilyResult<FundamentalsDataset>>;
  readonly news: (input: {
    readonly symbol: string;
    readonly companyName: string;
    readonly asOf: string;
    readonly existingEventKeys: readonly string[];
    readonly recentDays?: number;
    readonly allowArchiveFallback?: boolean;
    readonly collectionMode?: "briefing" | "research";
    readonly researchContext?: {
      readonly question: string;
      readonly investmentHorizon: "short" | "medium" | "long";
      readonly analysisDepth: "core" | "standard" | "deep";
      readonly decisionPurpose:
        | "new_entry"
        | "holding_review"
        | "position_sizing"
        | "earnings";
    };
  }) => Promise<FamilyResult<NewsDataset>>;
  readonly documents: (input: {
    readonly symbol: string;
    readonly asOf: string;
  }) => Promise<FamilyResult<DocumentsDataset>>;
  readonly calendar: (input: {
    readonly symbol: string;
    readonly asOf: string;
  }) => Promise<FamilyResult<CalendarDataset>>;
  readonly peers: (input: {
    readonly symbol: string;
  }) => Promise<FamilyResult<PeersDataset>>;
  readonly options: (input: {
    readonly symbol: string;
    readonly asOf: string;
    readonly entitled: boolean;
    readonly needed: boolean;
  }) => Promise<FamilyResult<OptionsDataset>>;
};

export type InsightSentryResearchDataOptions = {
  readonly client: InsightSentryClient;
  readonly rollout: InsightSentryResearchRollout;
  readonly classifyNews: NewsClassifier;
  readonly screenPeers: PeerScreen;
  readonly dataRoot?: string;
};

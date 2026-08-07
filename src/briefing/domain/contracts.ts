import { z } from "zod";
import type { Locale } from "../../lib/i18n";

export const BriefingSymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9.-]{0,11}$/u);

export type BriefingAccess = {
  readonly authenticated: boolean;
  readonly tier: "free" | "pro" | "ultra";
  readonly enabled: boolean;
  readonly watchlistLimit: number;
  readonly watchlistChangesRemaining?: number;
};

export type BriefingWatchlistItem = {
  readonly symbol: string;
  readonly providerCode: string;
  readonly company: string;
  readonly exchange: "NASDAQ" | "NYSE" | "NYSE_AMERICAN";
  readonly position: number;
  readonly createdAt: string;
};

export type BriefingSource = {
  readonly title: string;
  readonly publisher: string;
  readonly publishedAt: string;
  readonly url: string;
};

export type BriefingSignal = {
  readonly id: string;
  readonly kind: "company" | "market" | "risk" | "calendar" | "price";
  readonly direction: "positive" | "negative" | "mixed" | "neutral";
  readonly title: string;
  readonly detail: string;
  readonly investmentMeaning: string;
  readonly occurredAt: string;
  readonly sourceUrl?: string;
};

export type BriefingAgentView = {
  readonly agent: "market" | "company" | "financial" | "risk";
  readonly stance: "positive" | "negative" | "watch" | "neutral";
  readonly headline: string;
  readonly detail: string;
};

export type BriefingUpcomingEvent = {
  readonly name: string;
  readonly scheduledAt: string;
  readonly whyItMatters: string;
  readonly certainty?: "confirmed" | "estimated";
};

export type BriefingDecisionCheck = {
  readonly title: string;
  readonly timing: string;
  readonly metric: string;
  readonly confirmation: string;
  readonly ifConfirmed: string;
  readonly ifFailed: string;
};

export type BriefingMarketReference = {
  readonly previousClose?: number;
  readonly previousHigh?: number;
  readonly previousLow?: number;
  readonly averageVolume20d?: number;
  readonly high20d?: number;
  readonly low20d?: number;
  readonly premarketGapPercent?: number;
};

export type BriefingTechnicalReference = {
  readonly timeframe: "4h";
  readonly observedAt: string;
  readonly barCount: number;
  readonly trend: "bullish" | "bearish" | "mixed";
  readonly sma20?: number;
  readonly sma50?: number;
  readonly rsi14?: number;
  readonly macd?: number;
  readonly macdSignal?: number;
  readonly atr14?: number;
  readonly volumeRatio20?: number;
  readonly support: number;
  readonly resistance: number;
};

export type BriefingFundamentalPoint = {
  readonly observedAt: string;
  readonly value: number;
};

export type BriefingEarningsSnapshot = {
  readonly latestReportAt?: string;
  readonly nextReportAt?: string;
  readonly nextReportCertainty?: "confirmed" | "estimated";
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

export type BriefingEditionPayload = {
  readonly schemaVersion: 1;
  readonly symbol: string;
  readonly company: string;
  readonly locale: Locale;
  readonly marketDate: string;
  readonly generatedAt: string;
  readonly cutoffAt: string;
  readonly coverageStart: string;
  readonly status: "ready" | "partial";
  readonly attention: "low" | "medium" | "high";
  readonly headline: string;
  readonly summary: string;
  readonly price: {
    readonly value?: number;
    readonly currency?: string;
    readonly changePercent?: number;
    readonly marketState?: string;
    readonly observedAt?: string;
  };
  readonly earnings?: BriefingEarningsSnapshot;
  readonly materialChanges: readonly BriefingSignal[];
  readonly agentViews: readonly BriefingAgentView[];
  readonly bullCase: string;
  readonly bearCase: string;
  readonly upcomingEvents: readonly BriefingUpcomingEvent[];
  readonly todayChecks: readonly (BriefingDecisionCheck | string)[];
  readonly changedSincePrevious?: string;
  readonly stillWatching?: string;
  readonly sources: readonly BriefingSource[];
  readonly limitations: readonly string[];
};

export type BriefingListItem = {
  readonly briefingId: string;
  readonly symbol: string;
  readonly company: string;
  readonly locale: Locale;
  readonly marketDate: string;
  readonly generatedAt: string;
  readonly status: "ready" | "partial";
  readonly attention: "low" | "medium" | "high";
  readonly headline: string;
  readonly summary: string;
  readonly price: BriefingEditionPayload["price"];
  readonly nextEarnings?: BriefingUpcomingEvent;
  readonly unread: boolean;
};

export type BriefingRoomState = BriefingAccess & {
  readonly nextBriefingAt: string;
  readonly marketTimeZone: "America/New_York";
  readonly watchlist: readonly BriefingWatchlistItem[];
  readonly briefings: readonly BriefingListItem[];
  readonly unreadCount: number;
};

export type BriefingAudience = {
  readonly principalId: string;
  readonly locale: Locale;
  readonly item: BriefingWatchlistItem;
};

export type BriefingSourceSnapshot = {
  readonly symbol: string;
  readonly company: string;
  readonly providerCode: string;
  readonly marketDate: string;
  readonly cutoffAt: string;
  readonly coverageStart: string;
  readonly quote: BriefingEditionPayload["price"];
  readonly signals: readonly BriefingSignal[];
  readonly upcomingEvents: readonly BriefingUpcomingEvent[];
  readonly fundamentals: Readonly<Record<string, number | string>>;
  readonly fundamentalSeries?: Readonly<
    Record<string, readonly BriefingFundamentalPoint[]>
  >;
  readonly marketReference?: BriefingMarketReference;
  readonly technicalReference?: BriefingTechnicalReference;
  readonly earnings?: BriefingEarningsSnapshot;
  readonly sources: readonly BriefingSource[];
  readonly limitations: readonly string[];
};

export type SaveBriefingEdition = {
  readonly briefingId: string;
  readonly symbol: string;
  readonly company: string;
  readonly marketDate: string;
  readonly locale: Locale;
  readonly scheduledFor: string;
  readonly snapshotId: string;
  readonly payload: BriefingEditionPayload;
};

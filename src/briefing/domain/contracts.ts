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
  readonly materialChanges: readonly BriefingSignal[];
  readonly agentViews: readonly BriefingAgentView[];
  readonly bullCase: string;
  readonly bearCase: string;
  readonly upcomingEvents: readonly BriefingUpcomingEvent[];
  readonly todayChecks: readonly string[];
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

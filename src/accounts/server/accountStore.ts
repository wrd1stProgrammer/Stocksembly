import type {
  AcquisitionAttributionInput,
  AdminAnalyticsOverview,
  AdminAnalyticsQuery,
  AdminUserDetail,
  AdminUserList,
} from "../../admin/analyticsContracts";
import type {
  BriefingAccess,
  BriefingAudience,
  BriefingEditionPayload,
  BriefingListItem,
  BriefingSourceSnapshot,
  BriefingWatchlistItem,
  SaveBriefingEdition,
} from "../../briefing/domain/contracts";
import type { AppLocale, Locale } from "../../lib/i18n";
import type {
  BillingCreditActivity,
  BillingCreditNotice,
  BillingCredits,
  BillingPlanKey,
  BillingStatus,
  BillingTier,
} from "../../lib/whop/contracts";
import type { WhopWebhookEvent } from "../../lib/whop/server";
import type {
  PublicReport,
  PublicRun,
  RunCursor,
} from "../../research/server/api/researchApiContracts";
import type { PublicQuestion } from "../../research/server/api/researchCommandContracts";
import type { ResearchPrincipal } from "../../research/server/http/researchAuth";

export class AccountStoreUnavailableError extends Error {
  readonly name = "AccountStoreUnavailableError";
}

export type CreditAvailability = {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly required: number;
};

export type AccountBillingStatus = {
  readonly tier: BillingTier;
  readonly status: BillingStatus;
  readonly credits: BillingCredits;
  readonly recentActivity: readonly BillingCreditActivity[];
  readonly creditNotice?: BillingCreditNotice;
  readonly planKey?: BillingPlanKey;
  readonly planId?: string;
  readonly currentPeriodStart?: string;
  readonly currentPeriodEnd?: string;
  readonly cancelAtPeriodEnd?: boolean;
  readonly manageUrl?: string;
};

export type AccountStore = {
  readonly syncUser: (
    principal: ResearchPrincipal,
    observedAt: string,
  ) => Promise<void>;
  readonly recordResearchRun: (
    principalId: string,
    run: PublicRun,
  ) => Promise<void>;
  readonly checkCredits?: (
    principalId: string,
    required: number,
  ) => Promise<CreditAvailability>;
  readonly reserveResearchCredits?: (
    principalId: string,
    runId: string,
    required: number,
  ) => Promise<CreditAvailability>;
  readonly releaseResearchCredits?: (
    principalId: string,
    runId: string,
  ) => Promise<void>;
  readonly listResearchRuns?: (
    principalId: string,
    limit: number,
    cursor?: RunCursor,
  ) => Promise<readonly PublicRun[]>;
  readonly recordReportOwnership: (
    principalId: string,
    report: PublicReport,
  ) => Promise<void>;
  readonly recordConsultation?: (
    principalId: string,
    question: PublicQuestion,
  ) => Promise<void>;
  readonly checkChatCredits?: (
    principalId: string,
  ) => Promise<CreditAvailability>;
  readonly consumeResearchRoomCredit?: (
    principalId: string,
    eventKey: string,
    reportId: string,
  ) => Promise<CreditAvailability>;
  readonly listConsultations?: (
    principalId: string,
    reportId: string,
  ) => Promise<readonly PublicQuestion[]>;
  readonly researchRoomAccess?: (
    principalId: string,
  ) => Promise<"free" | "paid">;
  readonly billingStatus?: (
    principalId: string,
  ) => Promise<AccountBillingStatus>;
  readonly handleWhopWebhook?: (event: WhopWebhookEvent) => Promise<void>;
  readonly createCheckoutAttempt?: (
    principalId: string,
    planKey: BillingPlanKey,
    attemptId: string,
  ) => Promise<void>;
  readonly markCheckoutAttemptReady?: (
    attemptId: string,
    checkoutConfigurationId?: string,
  ) => Promise<void>;
  readonly markCheckoutAttemptFailed?: (attemptId: string) => Promise<void>;
  readonly recordAcquisitionAttribution?: (
    principalId: string,
    attribution: AcquisitionAttributionInput,
  ) => Promise<"stored" | "exists">;
  readonly adminAnalyticsOverview?: (
    query: AdminAnalyticsQuery,
  ) => Promise<AdminAnalyticsOverview>;
  readonly adminAnalyticsUsers?: (
    query: AdminAnalyticsQuery,
  ) => Promise<AdminUserList>;
  readonly adminAnalyticsUser?: (
    principalId: string,
    query: AdminAnalyticsQuery,
  ) => Promise<AdminUserDetail | undefined>;
  readonly preferredLocale?: (
    principalId: string,
  ) => Promise<AppLocale | undefined>;
  readonly updatePreferredLocale?: (
    principalId: string,
    locale: AppLocale,
  ) => Promise<void>;
  readonly briefingAccess?: (principalId: string) => Promise<BriefingAccess>;
  readonly listBriefingWatchlist?: (
    principalId: string,
  ) => Promise<readonly BriefingWatchlistItem[]>;
  readonly addBriefingWatchlistItem?: (
    principalId: string,
    item: Omit<BriefingWatchlistItem, "position" | "createdAt">,
  ) => Promise<
    | { readonly kind: "added"; readonly item: BriefingWatchlistItem }
    | { readonly kind: "exists"; readonly item: BriefingWatchlistItem }
    | { readonly kind: "limit"; readonly limit: number }
    | { readonly kind: "change_limit"; readonly remaining: 0 }
    | { readonly kind: "forbidden" }
  >;
  readonly removeBriefingWatchlistItem?: (
    principalId: string,
    symbol: string,
  ) => Promise<{
    readonly removed: boolean;
    readonly changesRemaining: number;
    readonly limitReached?: boolean;
  }>;
  readonly listBriefingAudience?: () => Promise<readonly BriefingAudience[]>;
  readonly listBriefingEditionKeys?: (
    marketDate: string,
  ) => Promise<ReadonlySet<string>>;
  readonly saveBriefingSourceSnapshot?: (
    snapshot: BriefingSourceSnapshot,
  ) => Promise<string>;
  readonly findPreviousBriefingEdition?: (
    symbol: string,
    locale: Locale,
    beforeMarketDate: string,
  ) => Promise<BriefingEditionPayload | undefined>;
  readonly listBriefingEventKeys?: (
    symbol: string,
    locale: Locale,
    beforeMarketDate: string,
    editionLimit: number,
  ) => Promise<readonly string[]>;
  readonly saveBriefingEdition?: (
    edition: SaveBriefingEdition,
    recipients: readonly string[],
  ) => Promise<void>;
  readonly listBriefings?: (
    principalId: string,
    locale: Locale,
    limit: number,
  ) => Promise<readonly BriefingListItem[]>;
  readonly briefingDetail?: (
    principalId: string,
    briefingId: string,
  ) => Promise<BriefingEditionPayload | undefined>;
  readonly markBriefingRead?: (
    principalId: string,
    briefingId: string,
  ) => Promise<boolean>;
  readonly close: () => Promise<void>;
};

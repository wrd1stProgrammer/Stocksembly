import type { Locale } from "../../lib/i18n";
import type {
  BillingCreditActivity,
  BillingCredits,
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
  readonly preferredLocale?: (
    principalId: string,
  ) => Promise<Locale | undefined>;
  readonly updatePreferredLocale?: (
    principalId: string,
    locale: Locale,
  ) => Promise<void>;
  readonly close: () => Promise<void>;
};

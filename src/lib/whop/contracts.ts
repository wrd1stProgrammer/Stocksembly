export type BillingPlanKey =
  | "pro-monthly"
  | "pro-annual"
  | "ultra-monthly"
  | "ultra-annual";

export function billingCheckoutPath(planKey: BillingPlanKey): string {
  return `/api/billing/checkout?plan=${encodeURIComponent(planKey)}`;
}

export type BillingTier = "free" | "pro" | "ultra";

export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "cancelled"
  | "none";

export type BillingCredits = {
  readonly remaining: number;
  readonly allowance: number;
  readonly used: number;
  readonly usedPercent: number;
  readonly periodStart: string;
  readonly periodEnd: string;
};

export type BillingCreditActivityCode =
  | "free_daily_grant"
  | "free_signup_grant"
  | "pro_monthly_grant"
  | "ultra_monthly_grant"
  | "full_research"
  | "department_research"
  | "chat_bundle"
  | "research_room"
  | "research_run"
  | "consultation";

export type BillingCreditActivity = {
  readonly id: string;
  readonly kind: "grant" | "usage";
  readonly code: BillingCreditActivityCode;
  readonly amount: number;
  readonly occurredAt: string;
};

export type BillingCreditNotice = {
  readonly id: string;
  readonly kind: "signup" | "daily";
  readonly amount: number;
  readonly grantedAt: string;
  readonly balance: number;
};

export type WhopBillingStatus = {
  readonly authenticated: boolean;
  readonly tier: BillingTier;
  readonly status: BillingStatus;
  readonly credits: BillingCredits;
  readonly recentActivity: readonly BillingCreditActivity[];
  /** The newest free-credit grant, used by the client to show a one-time modal. */
  readonly creditNotice?: BillingCreditNotice;
  readonly planKey?: BillingPlanKey;
  readonly planId?: string;
  readonly currentPeriodStart?: string;
  readonly currentPeriodEnd?: string;
  readonly cancelAtPeriodEnd?: boolean;
  readonly manageUrl?: string;
};

export type WhopPricingPlan = {
  readonly key: BillingPlanKey;
  readonly tier: "Pro" | "Ultra";
  readonly amount: number;
  readonly interval: "month" | "year";
  readonly planId: string;
  readonly purchaseUrl: string;
};

export type WhopPricingResponse = {
  readonly environment: "sandbox" | "production";
  readonly productId: string;
  readonly plans: readonly WhopPricingPlan[];
};

export type WhopCheckoutLaunch = {
  readonly purchaseUrl: string;
  readonly planId?: string;
  readonly sessionId?: string;
  readonly returnUrl?: string;
  readonly environment?: "sandbox" | "production";
};

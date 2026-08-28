import { afterEach, describe, expect, it, vi } from "vitest";
import { billingCheckoutPath } from "./contracts";
import {
  CREDIT_COSTS,
  MONTHLY_CREDIT_ALLOWANCE,
  paidCreditGrantDelta,
} from "./creditPolicy";
import {
  billingPlanKeyForWhopPlanId,
  FREE_DAILY_CREDIT_ALLOWANCE,
  FREE_SIGNUP_CREDIT_ALLOWANCE,
  isWhopProMonthlyLiveTestPlan,
  subscriptionCheckoutDecision,
} from "./server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Whop billing contracts", () => {
  it("uses the final plan and free-credit policy", () => {
    expect(MONTHLY_CREDIT_ALLOWANCE.pro).toBe(150);
    expect(MONTHLY_CREDIT_ALLOWANCE.ultra).toBe(400);
    expect(FREE_SIGNUP_CREDIT_ALLOWANCE).toBe(4);
    expect(FREE_DAILY_CREDIT_ALLOWANCE).toBe(0);
    expect(CREDIT_COSTS.researchRoomView).toBe(3);
    expect(CREDIT_COSTS.researchTranslation).toBe(1);
  });

  it("routes plan changes through the Stocksembly checkout session", () => {
    expect(billingCheckoutPath("ultra-annual")).toBe(
      "/api/billing/checkout?plan=ultra-annual",
    );
  });

  it("recognizes sandbox plan aliases on the production account backend", () => {
    vi.stubEnv("WHOP_PLAN_ULTRA_MONTHLY_ID", "plan_production_ultra");
    vi.stubEnv("WHOP_SANDBOX_PLAN_ULTRA_MONTHLY_ID", "plan_sandbox_ultra");

    expect(billingPlanKeyForWhopPlanId("plan_sandbox_ultra")).toBe(
      "ultra-monthly",
    );
  });

  it("maps the hidden one-dollar live test plan to Pro monthly", () => {
    vi.stubEnv(
      "WHOP_PLAN_PRO_MONTHLY_LIVE_TEST_ID",
      "plan_live_test_pro_monthly",
    );

    expect(billingPlanKeyForWhopPlanId("plan_live_test_pro_monthly")).toBe(
      "pro-monthly",
    );
  });

  it("accepts only the one-dollar monthly production test shape", () => {
    expect(
      isWhopProMonthlyLiveTestPlan({
        renewal_price: 1,
        billing_period: 30,
      }),
    ).toBe(true);
    expect(
      isWhopProMonthlyLiveTestPlan({
        renewal_price: 19,
        billing_period: 30,
      }),
    ).toBe(false);
  });

  it("uses the existing Whop membership portal for an active paid user", () => {
    // Given
    const manageUrl = "https://sandbox.whop.com/billing/manage/mber_test/";

    // When
    const decision = subscriptionCheckoutDecision({
      tier: "pro",
      status: "active",
      manageUrl,
    });

    // Then
    expect(decision).toEqual({ kind: "manage", purchaseUrl: manageUrl });
  });

  it("blocks a second checkout when an active membership has no manage URL", () => {
    // Given / When
    const decision = subscriptionCheckoutDecision({
      tier: "ultra",
      status: "trialing",
    });

    // Then
    expect(decision).toEqual({ kind: "blocked" });
  });

  it("creates checkout for a free user", () => {
    // Given / When
    const decision = subscriptionCheckoutDecision({
      tier: "free",
      status: "none",
    });

    // Then
    expect(decision).toEqual({ kind: "checkout" });
  });

  it("grants only the monthly allowance difference on upgrade", () => {
    // Given / When
    const delta = paidCreditGrantDelta(150, 400);

    // Then
    expect(delta).toBe(250);
  });

  it("does not claw back current-period credits on downgrade", () => {
    // Given / When
    const delta = paidCreditGrantDelta(400, 150);

    // Then
    expect(delta).toBe(0);
  });
});

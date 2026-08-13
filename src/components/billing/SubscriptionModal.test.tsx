import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SubscriptionModal } from "./SubscriptionModal";

vi.mock("border-beam", () => ({
  BorderBeam: ({ children }: { readonly children: ReactNode }) => children,
}));

const plans = [
  {
    key: "pro-monthly" as const,
    tier: "Pro" as const,
    amount: 19,
    interval: "month" as const,
    planId: "plan_pro_monthly",
    purchaseUrl: "https://example.com/pro-monthly",
  },
  {
    key: "pro-annual" as const,
    tier: "Pro" as const,
    amount: 190,
    interval: "year" as const,
    planId: "plan_pro_annual",
    purchaseUrl: "https://example.com/pro-annual",
  },
  {
    key: "ultra-monthly" as const,
    tier: "Ultra" as const,
    amount: 39,
    interval: "month" as const,
    planId: "plan_ultra_monthly",
    purchaseUrl: "https://example.com/ultra-monthly",
  },
  {
    key: "ultra-annual" as const,
    tier: "Ultra" as const,
    amount: 390,
    interval: "year" as const,
    planId: "plan_ultra_annual",
    purchaseUrl: "https://example.com/ultra-annual",
  },
];

describe("SubscriptionModal pricing", () => {
  it("renders complete static price and credit values without per-glyph overlap", () => {
    const { container } = render(
      <SubscriptionModal
        open
        locale="ko"
        subscriptionTier="free"
        plans={plans}
        billingStatus={undefined}
        loading={false}
        error={false}
        onClose={() => undefined}
      />,
    );

    const pro = container.querySelector(
      '.subscription-plan-card-wrap[data-plan="pro"]',
    );
    const ultra = container.querySelector(
      '.subscription-plan-card-wrap[data-plan="ultra"]',
    );
    const proPrice = pro?.querySelector(".subscription-plan-card__price-value");
    const proCredits = pro?.querySelector(
      ".subscription-plan-card__credit-value",
    );

    expect(proPrice).toHaveTextContent("$15.83");
    expect(proPrice?.childElementCount).toBe(0);
    expect(proCredits).toHaveTextContent("100");
    expect(proCredits?.childElementCount).toBe(0);
    expect(ultra).toHaveTextContent("500");
  });

  it("renders the paid overview price, balance, and allowance as stable text", () => {
    const { container } = render(
      <SubscriptionModal
        open
        locale="ko"
        subscriptionTier="paid"
        plans={plans}
        billingStatus={{
          authenticated: true,
          tier: "pro",
          status: "active",
          planKey: "pro-annual",
          manageUrl: "https://sandbox.whop.com/billing/manage/mber_test/",
          currentPeriodStart: "2026-08-05T00:00:00.000Z",
          currentPeriodEnd: "2027-08-05T00:00:00.000Z",
          credits: {
            remaining: 100,
            allowance: 216,
            used: 116,
            usedPercent: 53.7,
            periodStart: "2026-08-01T00:00:00.000Z",
            periodEnd: "2026-09-01T00:00:00.000Z",
          },
          recentActivity: [],
        }}
        loading={false}
        error={false}
        onClose={() => undefined}
      />,
    );

    const balance = container.querySelector(
      ".subscription-credit-meter__value",
    );
    const price = container.querySelector(
      ".subscription-overview__price-amount",
    );
    const allowance = container.querySelector(".subscription-overview__number");
    const planChange = container.querySelector(
      ".subscription-overview__manage",
    );

    expect(balance).toHaveTextContent("100");
    expect(price).toHaveTextContent("$190");
    expect(allowance).toHaveTextContent("216");
    expect(planChange).toHaveTextContent("Ultra로 업그레이드");
    expect(planChange).toHaveAttribute(
      "href",
      "https://sandbox.whop.com/billing/manage/mber_test/",
    );
    expect(balance?.childElementCount).toBe(0);
    expect(price?.childElementCount).toBe(0);
    expect(allowance?.childElementCount).toBe(0);
  });
});

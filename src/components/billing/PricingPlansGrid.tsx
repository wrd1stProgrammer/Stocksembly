"use client";

import { MotionConfig, motion } from "motion/react";
import { useId, useState } from "react";
import { currentAuthTokens } from "../../auth/researchSession";
import type { Locale } from "../../lib/i18n";
import { PricingCard, type PricingCardPlan } from "../ui/pricing-card";

export type { PricingCardPlan as SubscriptionPlanCard } from "../ui/pricing-card";

export type BillingCycle = "monthly" | "annual";

type PricingPlansGridProps = {
  readonly plans: readonly PricingCardPlan[];
  readonly locale: Locale;
  readonly initialCycle?: BillingCycle;
  readonly onFreeSelect?: () => void;
};

function BillingToggle({
  cycle,
  locale,
  onChange,
}: {
  readonly cycle: BillingCycle;
  readonly locale: Locale;
  readonly onChange: (cycle: BillingCycle) => void;
}) {
  const thumbId = useId();
  return (
    <div className="subscription-billing-toggle-wrap">
      <span className="subscription-billing-toggle__label" aria-hidden="true">
        {locale === "ko" ? "결제 주기" : "Billing cycle"}
      </span>
      <fieldset className="subscription-billing-toggle">
        <legend className="subscription-billing-toggle__sr-label">
          {locale === "ko" ? "결제 주기" : "Billing cycle"}
        </legend>
        {(["monthly", "annual"] as const).map((value) => (
          <button
            type="button"
            key={value}
            className={cycle === value ? "is-active" : undefined}
            aria-pressed={cycle === value}
            onClick={() => onChange(value)}
          >
            {cycle === value ? (
              <motion.span
                layoutId={thumbId}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="subscription-billing-toggle__thumb"
                aria-hidden="true"
              />
            ) : null}
            <span className="subscription-billing-toggle__text">
              {value === "monthly"
                ? locale === "ko"
                  ? "월간"
                  : "Monthly"
                : locale === "ko"
                  ? "연간"
                  : "Annual"}
            </span>
            {value === "annual" ? (
              <span className="subscription-billing-toggle__save">
                {locale === "ko" ? "2개월 무료" : "Save 2 mo"}
              </span>
            ) : null}
          </button>
        ))}
      </fieldset>
      <span className="subscription-billing-toggle__note">
        {cycle === "annual"
          ? locale === "ko"
            ? "연간 결제 · 2개월 무료"
            : "Billed yearly · 2 months free"
          : locale === "ko"
            ? "언제든 변경 가능"
            : "Change anytime"}
      </span>
    </div>
  );
}

export function PricingPlansGrid({
  plans,
  locale,
  initialCycle = "annual",
  onFreeSelect,
}: PricingPlansGridProps) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [checkoutPlanId, setCheckoutPlanId] = useState<string>();
  const [checkoutError, setCheckoutError] = useState(false);
  const isAnnual = cycle === "annual";

  async function handleCheckout(checkoutUrl: string, planId: string) {
    if (checkoutPlanId !== undefined) return;
    setCheckoutPlanId(planId);
    setCheckoutError(false);
    try {
      const tokens = await currentAuthTokens();
      if (tokens.accessToken === undefined) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      const response = await fetch(checkoutUrl, {
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${tokens.accessToken}`,
          ...(tokens.identityToken
            ? { "x-stocksembly-identity-token": tokens.identityToken }
            : {}),
        },
      });
      const payload = (await response.json().catch(() => undefined)) as
        | { readonly purchaseUrl?: unknown }
        | undefined;

      if (response.status === 401) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!response.ok || typeof payload?.purchaseUrl !== "string")
        throw new Error("BILLING_CHECKOUT_UNAVAILABLE");

      window.location.assign(payload.purchaseUrl);
    } catch {
      setCheckoutError(true);
    } finally {
      setCheckoutPlanId(undefined);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <section className="subscription-plans" aria-label="Stocksembly plans">
        <div className="subscription-plans__toolbar">
          <h3>{locale === "ko" ? "요금제" : "Plans"}</h3>
          <BillingToggle cycle={cycle} locale={locale} onChange={setCycle} />
        </div>

        <div className="subscription-plans__grid">
          {plans.map((plan) => {
            const total = isAnnual ? plan.annualAmount : plan.monthlyAmount;
            const effectiveMonthly =
              isAnnual && plan.annualAmount !== null
                ? plan.annualAmount / 12
                : plan.monthlyAmount;
            const checkoutUrl = isAnnual
              ? plan.annualCheckoutUrl
              : plan.monthlyCheckoutUrl;
            return (
              <PricingCard
                key={plan.id}
                plan={plan}
                locale={locale}
                cycle={cycle}
                amount={effectiveMonthly}
                total={total}
                checkoutUrl={checkoutUrl}
                onCheckout={
                  checkoutUrl
                    ? () => {
                        void handleCheckout(checkoutUrl, plan.id);
                      }
                    : undefined
                }
                checkoutPending={checkoutPlanId === plan.id}
                onFreeSelect={onFreeSelect}
              />
            );
          })}
        </div>
        {checkoutError ? (
          <p className="subscription-modal__notice is-error" role="alert">
            {locale === "ko"
              ? "결제 페이지를 열지 못했습니다. 잠시 후 다시 시도해 주세요."
              : "We could not open checkout. Please try again in a moment."}
          </p>
        ) : null}
      </section>
    </MotionConfig>
  );
}

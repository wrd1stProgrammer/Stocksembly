"use client";

import { MotionConfig, motion } from "motion/react";
import { useId, useState } from "react";
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
  const isAnnual = cycle === "annual";

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
                onFreeSelect={onFreeSelect}
              />
            );
          })}
        </div>
      </section>
    </MotionConfig>
  );
}

"use client";

import { BorderBeam } from "border-beam";
import { ArrowUpRight, Check, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Locale } from "../../lib/i18n";

export type PricingCardPlan = {
  readonly id: "free" | "pro" | "ultra";
  readonly name: string;
  readonly description: string;
  readonly monthlyAmount: number | null;
  readonly annualAmount: number | null;
  readonly creditAllowance?: number;
  readonly priceLabel?: string;
  readonly originalMonthlyAmount?: number | null;
  readonly monthlyCheckoutUrl?: string | undefined;
  readonly annualCheckoutUrl?: string | undefined;
  readonly features: readonly string[];
  readonly featured?: boolean;
  readonly badge?: string;
  readonly discount?: string;
  readonly highlight?: string;
};

type PricingCardProps = {
  readonly plan: PricingCardPlan;
  readonly locale: Locale;
  readonly cycle: "monthly" | "annual";
  readonly amount: number | null;
  readonly total: number | null;
  readonly checkoutUrl?: string | undefined;
  readonly onCheckout?: (() => void) | undefined;
  readonly checkoutPending?: boolean;
  readonly onFreeSelect?: (() => void) | undefined;
};

function formatCurrency(value: number): string {
  return `$${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function PriceRoll({
  amount,
  planId,
  cycle,
}: {
  readonly amount: number | null;
  readonly planId: PricingCardPlan["id"];
  readonly cycle: "monthly" | "annual";
}) {
  const formatted = amount === null ? "—" : formatCurrency(amount);

  return (
    <span className="subscription-plan-card__price-value" aria-live="polite">
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={`${planId}-${cycle}-${formatted}`}
          initial={{ opacity: 0, y: 8, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(5px)" }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {formatted}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function PricingCard({
  plan,
  locale,
  cycle,
  amount,
  total,
  checkoutUrl,
  onCheckout,
  checkoutPending = false,
  onFreeSelect,
}: PricingCardProps) {
  const isAnnual = cycle === "annual";
  const isFree = plan.id === "free";

  return (
    <div className="subscription-plan-card-wrap" data-plan={plan.id}>
      {plan.featured ? (
        <div className="subscription-plan-card__sleeve" aria-hidden="true">
          <Sparkles size={13} />
          <span>{plan.highlight}</span>
        </div>
      ) : null}

      <BorderBeam
        className="subscription-plan-card-beam"
        size="md"
        colorVariant="ocean"
        theme="dark"
        duration={2.8}
        strength={plan.featured ? 0.86 : 0.56}
        hueRange={18}
        borderRadius={20}
      >
        <article
          className={`subscription-plan-card${
            plan.featured ? " is-featured" : ""
          }`}
        >
          <header className="subscription-plan-card__header">
            <div className="subscription-plan-card__heading">
              <h3>{plan.name}</h3>
            </div>
            {plan.badge ? (
              <span className="subscription-plan-card__badge">
                {plan.badge}
              </span>
            ) : null}
          </header>

          <div className="subscription-plan-card__body">
            <div className="subscription-plan-card__pricing-panel">
              <div className="subscription-plan-card__pricing-topline">
                <span className="subscription-plan-card__billing-note">
                  {isFree
                    ? locale === "ko"
                      ? "기본 기능은 무료"
                      : "Core access is free"
                    : isAnnual && total !== null && total > 0
                      ? `${formatCurrency(total)} ${locale === "ko" ? "연간 결제" : "billed yearly"}`
                      : locale === "ko"
                        ? "월간 결제"
                        : "Billed monthly"}
                </span>
                {plan.discount && isAnnual && !isFree ? (
                  <span className="subscription-plan-card__discount-chip">
                    {plan.discount}
                  </span>
                ) : null}
              </div>

              <div className="subscription-plan-card__price" aria-live="polite">
                {plan.priceLabel ? (
                  <strong className="subscription-plan-card__price-label">
                    {plan.priceLabel}
                  </strong>
                ) : (
                  <strong>
                    <PriceRoll amount={amount} planId={plan.id} cycle={cycle} />
                    {isAnnual && plan.originalMonthlyAmount ? (
                      <span className="subscription-plan-card__original-price">
                        {formatCurrency(plan.originalMonthlyAmount)}
                      </span>
                    ) : null}
                    <small>/ {locale === "ko" ? "월" : "mo"}</small>
                  </strong>
                )}
              </div>

              {plan.creditAllowance !== undefined ? (
                <div className="subscription-plan-card__credit-line">
                  <span>
                    {plan.id === "free"
                      ? locale === "ko"
                        ? "매일"
                        : "Daily"
                      : locale === "ko"
                        ? "매월"
                        : "Monthly"}
                  </span>
                  <strong>{plan.creditAllowance}</strong>
                  <span>{locale === "ko" ? "크레딧" : "credits"}</span>
                </div>
              ) : null}
            </div>

            <p className="subscription-plan-card__description">
              {plan.description}
            </p>

            <div className="subscription-plan-card__feature-heading">
              <span aria-hidden="true" />
              <span>{locale === "ko" ? "포함 기능" : "Included"}</span>
              <span aria-hidden="true" />
            </div>

            <ul className="subscription-plan-card__features">
              {plan.features.map((feature) => (
                <li key={feature}>
                  <span className="subscription-plan-card__feature-mark">
                    <Check size={13} aria-hidden="true" />
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {isFree ? (
            <button
              type="button"
              className="subscription-plan-card__action"
              onClick={onFreeSelect}
            >
              {locale === "ko" ? "계속 무료로 사용" : "Continue free"}
            </button>
          ) : checkoutUrl && onCheckout ? (
            <button
              type="button"
              className="subscription-plan-card__action"
              onClick={onCheckout}
              disabled={checkoutPending}
            >
              {checkoutPending
                ? locale === "ko"
                  ? "결제 페이지 여는 중..."
                  : "Opening checkout..."
                : locale === "ko"
                  ? "시작하기"
                  : "Get started"}
              {!checkoutPending ? (
                <ArrowUpRight size={16} aria-hidden="true" />
              ) : null}
            </button>
          ) : checkoutUrl ? (
            <a
              className="subscription-plan-card__action"
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
            >
              {locale === "ko" ? "시작하기" : "Get started"}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          ) : (
            <button
              type="button"
              className="subscription-plan-card__action"
              disabled
            >
              {locale === "ko" ? "가격 준비 중" : "Price loading"}
            </button>
          )}
        </article>
      </BorderBeam>
    </div>
  );
}

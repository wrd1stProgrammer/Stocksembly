"use client";

import "../../styles/billing.css";
import type { Locale } from "../../lib/i18n";
import {
  billingCheckoutPath,
  type WhopPricingPlan,
} from "../../lib/whop/contracts";
import { useWhopCheckout } from "./useWhopCheckout";
import { WhopCheckoutModal } from "./WhopCheckoutModal";

type Copy = {
  readonly monthly: string;
  readonly annual: string;
  readonly perMonth: string;
  readonly perYear: string;
  readonly choose: string;
  readonly pro: string;
  readonly ultra: string;
  readonly checkoutError: string;
};

type Props = {
  readonly plans: readonly WhopPricingPlan[];
  readonly locale: Locale;
  readonly copy: Copy;
};

export function PublicPricingGrid({ plans, locale, copy }: Props) {
  const { checkout, pendingId, error, startCheckout, closeCheckout } =
    useWhopCheckout();

  return (
    <>
      <section className="billing-page__grid" aria-label="Stocksembly plans">
        {plans.map((plan) => {
          const label = `${plan.tier} · ${
            plan.interval === "month" ? copy.monthly : copy.annual
          }`;
          return (
            <article
              className={`billing-card${
                plan.tier === "Ultra" ? " billing-card--featured" : ""
              }`}
              key={plan.key}
            >
              <div className="billing-card__topline">
                <span>{plan.tier}</span>
                <small>
                  {plan.interval === "month" ? copy.monthly : copy.annual}
                </small>
              </div>
              <h2>{plan.tier}</h2>
              <p>{plan.tier === "Pro" ? copy.pro : copy.ultra}</p>
              <strong>
                ${plan.amount}
                <small>
                  {plan.interval === "month" ? copy.perMonth : copy.perYear}
                </small>
              </strong>
              <button
                type="button"
                disabled={pendingId !== undefined}
                onClick={() => {
                  void startCheckout(
                    billingCheckoutPath(plan.key),
                    plan.key,
                    label,
                  );
                }}
              >
                {pendingId === plan.key ? "…" : copy.choose}
              </button>
            </article>
          );
        })}
      </section>
      {error ? (
        <p className="billing-page__unavailable" role="alert">
          {copy.checkoutError}
        </p>
      ) : null}
      <WhopCheckoutModal
        checkout={checkout}
        locale={locale}
        onClose={closeCheckout}
      />
    </>
  );
}

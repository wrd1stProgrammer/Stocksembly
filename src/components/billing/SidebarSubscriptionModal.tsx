"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  currentAuthTokens,
  syncResearchSession,
} from "../../auth/researchSession";
import type { Locale } from "../../lib/i18n";
import type {
  WhopBillingStatus,
  WhopPricingPlan,
  WhopPricingResponse,
} from "../../lib/whop/contracts";
import { SubscriptionModal } from "./SubscriptionModal";

type Props = {
  readonly open: boolean;
  readonly locale: Locale;
  readonly initialTier: "unknown" | "free" | "paid";
  readonly onClose: () => void;
};

async function authenticatedFetch(input: RequestInfo | URL) {
  const tokens = await currentAuthTokens().catch(() => undefined);
  const headers = new Headers();
  if (tokens?.accessToken !== undefined)
    headers.set("authorization", `Bearer ${tokens.accessToken}`);
  if (tokens?.identityToken !== undefined)
    headers.set("x-stocksembly-identity-token", tokens.identityToken);

  return fetch(input, {
    credentials: "same-origin",
    cache: "no-store",
    headers,
  });
}

export function SidebarSubscriptionModal({
  open,
  locale,
  initialTier,
  onClose,
}: Props) {
  const [tier, setTier] = useState(initialTier);
  const [plans, setPlans] = useState<readonly WhopPricingPlan[]>([]);
  const [billingStatus, setBillingStatus] = useState<WhopBillingStatus>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => setTier(initialTier), [initialTier]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoading(true);
    setError(false);

    void syncResearchSession()
      .catch(() => undefined)
      .then(() =>
        Promise.all([
          authenticatedFetch("/api/billing/plans"),
          authenticatedFetch("/api/billing/status"),
        ]),
      )
      .then(async ([plansResponse, statusResponse]) => {
        if (!active) return;

        if (plansResponse.ok) {
          const payload = (await plansResponse.json()) as WhopPricingResponse;
          setPlans(payload.plans);
        } else {
          setError(true);
        }

        if (statusResponse.ok) {
          const status = (await statusResponse.json()) as WhopBillingStatus;
          setBillingStatus(status);
          setTier(status.tier === "free" ? "free" : "paid");
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <SubscriptionModal
      open={open}
      locale={locale}
      subscriptionTier={tier}
      plans={plans}
      billingStatus={billingStatus}
      loading={loading}
      error={error}
      onClose={onClose}
    />,
    document.body,
  );
}

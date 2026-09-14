"use client";

import { useCallback, useState } from "react";
import { currentAuthTokens } from "../../auth/researchSession";
import { trackMetaEvent } from "../../lib/meta/pixel";
import type { WhopCheckoutLaunch } from "../../lib/whop/contracts";

export type EmbeddedWhopCheckout = {
  readonly sessionId: string;
  readonly returnUrl: string;
  readonly purchaseUrl: string;
  readonly environment: "sandbox" | "production";
  readonly label: string;
  readonly email?: string;
};

export function useWhopCheckout() {
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState(false);

  const startCheckout = useCallback(
    async (checkoutUrl: string, id: string) => {
      if (pendingId !== undefined) return;
      setPendingId(id);
      setError(false);
      // Open during the click gesture so async session creation is not blocked.
      const checkoutWindow = window.open("about:blank", "_blank");
      if (checkoutWindow) checkoutWindow.opener = null;

      try {
        const tokens = await currentAuthTokens();
        if (tokens.accessToken === undefined) {
          checkoutWindow?.close();
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
          | WhopCheckoutLaunch
          | undefined;

        if (response.status === 401) {
          checkoutWindow?.close();
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        if (!response.ok || typeof payload?.purchaseUrl !== "string")
          throw new Error("BILLING_CHECKOUT_UNAVAILABLE");

        if (payload.tracking !== undefined)
          trackMetaEvent(
            "InitiateCheckout",
            {
              value: payload.tracking.value,
              currency: payload.tracking.currency,
              content_name: payload.tracking.contentName,
              content_type: "product",
            },
            payload.tracking.eventId,
          );

        if (checkoutWindow && !checkoutWindow.closed) {
          checkoutWindow.location.replace(payload.purchaseUrl);
        } else {
          window.location.assign(payload.purchaseUrl);
        }
      } catch {
        checkoutWindow?.close();
        setError(true);
      } finally {
        setPendingId(undefined);
      }
    },
    [pendingId],
  );

  return {
    pendingId,
    error,
    startCheckout,
  } as const;
}

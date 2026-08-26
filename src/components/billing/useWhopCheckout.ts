"use client";

import { useCallback, useState } from "react";
import { currentAuthTokens } from "../../auth/researchSession";
import type { WhopCheckoutLaunch } from "../../lib/whop/contracts";

export type EmbeddedWhopCheckout = {
  readonly sessionId: string;
  readonly returnUrl: string;
  readonly purchaseUrl: string;
  readonly environment: "sandbox" | "production";
  readonly label: string;
  readonly email?: string;
};

function emailFromIdentityToken(token: string | undefined): string | undefined {
  if (token === undefined) return undefined;
  try {
    const encoded = token.split(".")[1];
    if (encoded === undefined) return undefined;
    const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(window.atob(`${normalized}${padding}`)) as {
      readonly email?: unknown;
    };
    return typeof payload.email === "string" && payload.email.includes("@")
      ? payload.email
      : undefined;
  } catch {
    return undefined;
  }
}

function isEmbeddedCheckout(
  payload: WhopCheckoutLaunch,
): payload is WhopCheckoutLaunch & {
  readonly sessionId: string;
  readonly returnUrl: string;
  readonly environment: "sandbox" | "production";
} {
  return (
    typeof payload.sessionId === "string" &&
    typeof payload.returnUrl === "string" &&
    (payload.environment === "sandbox" || payload.environment === "production")
  );
}

export function useWhopCheckout() {
  const [checkout, setCheckout] = useState<EmbeddedWhopCheckout>();
  const [pendingId, setPendingId] = useState<string>();
  const [error, setError] = useState(false);

  const startCheckout = useCallback(
    async (checkoutUrl: string, id: string, label: string) => {
      if (pendingId !== undefined) return;
      setPendingId(id);
      setError(false);

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
          | WhopCheckoutLaunch
          | undefined;

        if (response.status === 401) {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        if (!response.ok || typeof payload?.purchaseUrl !== "string")
          throw new Error("BILLING_CHECKOUT_UNAVAILABLE");

        if (!isEmbeddedCheckout(payload)) {
          window.location.assign(payload.purchaseUrl);
          return;
        }

        const email = emailFromIdentityToken(tokens.identityToken);
        setCheckout({
          sessionId: payload.sessionId,
          returnUrl: payload.returnUrl,
          purchaseUrl: payload.purchaseUrl,
          environment: payload.environment,
          label,
          ...(email === undefined ? {} : { email }),
        });
      } catch {
        setError(true);
      } finally {
        setPendingId(undefined);
      }
    },
    [pendingId],
  );

  const closeCheckout = useCallback(() => setCheckout(undefined), []);

  return {
    checkout,
    pendingId,
    error,
    startCheckout,
    closeCheckout,
  } as const;
}

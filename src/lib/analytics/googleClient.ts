"use client";

type GoogleTag = (...args: unknown[]) => void;
type GoogleWindow = Window & {
  gtag?: GoogleTag;
};

export const googleMeasurementId =
  process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"]?.trim();

function tag(): GoogleTag | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as GoogleWindow).gtag;
}

export function trackGoogleProductEvent(event: string): void {
  if (!googleMeasurementId) return;
  const name = event === "signup_confirmed" ? "sign_up" : event;
  tag()?.("event", name, {
    send_to: googleMeasurementId,
    ...(name === "sign_up" ? { method: "email" } : {}),
  });
}

function getTagValue(field: string): Promise<string | undefined> {
  const gtag = tag();
  if (!gtag || !googleMeasurementId) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(undefined), 600);
    gtag("get", googleMeasurementId, field, (value: unknown) => {
      window.clearTimeout(timeout);
      resolve(
        typeof value === "string" || typeof value === "number"
          ? String(value)
          : undefined,
      );
    });
  });
}

export async function googleCheckoutHeaders(): Promise<Record<string, string>> {
  const consent = document.cookie
    .split(";")
    .some((part) => part.trim() === "stocksembly_analytics_consent=granted");
  if (!consent) return {};
  const [clientId, sessionId] = await Promise.all([
    getTagValue("client_id"),
    getTagValue("session_id"),
  ]);
  // Consent may have been withdrawn while the tag callback was pending.
  if (
    !document.cookie
      .split(";")
      .some((part) => part.trim() === "stocksembly_analytics_consent=granted")
  )
    return {};
  if (!clientId || !/^\d{1,20}\.\d{1,20}$/.test(clientId)) return {};
  return {
    "x-stocksembly-ga-client-id": clientId,
    ...(sessionId && /^\d{1,20}$/.test(sessionId)
      ? { "x-stocksembly-ga-session-id": sessionId }
      : {}),
  };
}

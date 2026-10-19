import type { WhopWebhookEvent } from "../whop/server";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function googleCheckoutMetadata(
  request: Request,
): Record<string, string> {
  if (
    !request.headers
      .get("cookie")
      ?.split(";")
      .some((part) => part.trim() === "stocksembly_analytics_consent=granted")
  )
    return {};
  const clientId = request.headers.get("x-stocksembly-ga-client-id");
  const sessionId = request.headers.get("x-stocksembly-ga-session-id");
  if (!clientId || !/^\d{1,20}\.\d{1,20}$/.test(clientId)) return {};
  return {
    stocksembly_ga_consent: "granted",
    stocksembly_ga_client_id: clientId,
    ...(sessionId && /^\d{1,20}$/.test(sessionId)
      ? { stocksembly_ga_session_id: sessionId }
      : {}),
  };
}

export function googlePurchasePayload(
  event: WhopWebhookEvent,
  now = Date.now(),
) {
  if (
    event.type !== "payment.succeeded" ||
    event.sourceEnvironment !== "production"
  )
    return undefined;
  const data = record(event.data);
  const membership = record(data["membership"]);
  const metadata = {
    ...record(membership["metadata"]),
    ...record(data["metadata"]),
  };
  const clientId = metadata["stocksembly_ga_client_id"];
  if (
    metadata["stocksembly_ga_consent"] !== "granted" ||
    metadata["stocksembly_billing_test"] ||
    typeof clientId !== "string" ||
    !/^\d{1,20}\.\d{1,20}$/.test(clientId)
  )
    return undefined;
  const transactionId = data["id"];
  const rawAmount = data["subtotal"] ?? data["total"] ?? data["amount"];
  const value =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim()
        ? Number(rawAmount)
        : NaN;
  const currency = data["currency"];
  if (
    typeof transactionId !== "string" ||
    !/^pay_[a-zA-Z0-9_-]{1,100}$/.test(transactionId) ||
    !Number.isFinite(value) ||
    value <= 0 ||
    typeof currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(currency)
  )
    return undefined;
  const session = metadata["stocksembly_ga_session_id"];
  const sessionStart =
    typeof session === "string" && /^\d{1,12}$/.test(session)
      ? Number(session) * 1000
      : NaN;
  const recentSession =
    Number.isFinite(sessionStart) &&
    now >= sessionStart &&
    now - sessionStart < 24 * 60 * 60 * 1000;
  const plan = metadata["stocksembly_plan_key"];
  const itemId =
    typeof plan === "string" && /^(pro|ultra)-(monthly|annual)$/.test(plan)
      ? plan
      : "subscription";
  return {
    client_id: clientId,
    consent: { ad_user_data: "GRANTED", ad_personalization: "DENIED" },
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: transactionId,
          value,
          currency: currency.toUpperCase(),
          ...(recentSession ? { session_id: Number(session) } : {}),
          items: [
            { item_id: itemId, item_name: itemId, price: value, quantity: 1 },
          ],
        },
      },
    ],
  };
}

export async function sendGooglePurchase(
  event: WhopWebhookEvent,
): Promise<boolean> {
  const measurementId = process.env["NEXT_PUBLIC_GA_MEASUREMENT_ID"]?.trim();
  const secret = process.env["GA4_MEASUREMENT_PROTOCOL_API_SECRET"]?.trim();
  const payload = googlePurchasePayload(event);
  if (
    !measurementId ||
    !/^G-[A-Z0-9]+$/.test(measurementId) ||
    !secret ||
    !payload
  )
    return false;
  const url = new URL("https://www.google-analytics.com/mp/collect");
  url.searchParams.set("measurement_id", measurementId);
  url.searchParams.set("api_secret", secret);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok)
      console.warn("Google purchase measurement delivery failed");
    return response.ok;
  } catch {
    console.warn("Google purchase measurement delivery unavailable");
    return false;
  }
}

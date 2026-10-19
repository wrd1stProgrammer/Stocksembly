import { createHash } from "node:crypto";
import type { WhopWebhookEvent } from "../whop/server";
import { posthogEnabled, posthogHost, posthogToken } from "./config";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function purchaseProperties(event: WhopWebhookEvent) {
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
  if (
    metadata["stocksembly_meta_consent"] !== "granted" ||
    metadata["stocksembly_billing_test"]
  )
    return undefined;
  const principal = metadata["stocksembly_principal_id"];
  const transactionId = data["id"];
  const amount = data["subtotal"] ?? data["total"] ?? data["amount"];
  const value =
    typeof amount === "string" && amount.trim() !== ""
      ? Number(amount)
      : amount;
  const currency =
    data["currency"] ?? record(membership["plan"] ?? data["plan"])["currency"];
  if (
    typeof principal !== "string" ||
    principal.trim() === "" ||
    typeof transactionId !== "string" ||
    !/^pay_[a-zA-Z0-9_-]{1,100}$/.test(transactionId) ||
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    typeof currency !== "string" ||
    !/^[A-Za-z]{3}$/.test(currency)
  )
    return undefined;
  return {
    distinct_id: principal,
    $insert_id: createHash("sha256")
      .update(`posthog:whop:${transactionId}`)
      .digest("hex"),
    transaction_id: transactionId,
    revenue: value,
    currency: currency.toUpperCase(),
  };
}

export async function sendPostHogPurchase(
  event: WhopWebhookEvent,
): Promise<boolean> {
  if (!posthogEnabled) return false;
  const properties = purchaseProperties(event);
  if (!properties) return false;
  try {
    const response = await fetch(`${posthogHost}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: posthogToken,
        event: "purchase_completed",
        properties,
      }),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

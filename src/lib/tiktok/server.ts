import { createHash } from "node:crypto";
import type { WhopWebhookEvent } from "../whop/server";

export type TikTokCheckoutAttribution = {
  readonly ttclid?: string;
  readonly ttp?: string;
};

function cookie(request: Request, name: string): string | undefined {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return raw && /^[A-Za-z0-9._~-]{1,512}$/u.test(raw) ? raw : undefined;
}

export function tikTokCheckoutAttribution(
  request: Request,
): TikTokCheckoutAttribution | undefined {
  if (cookie(request, "stocksembly_tiktok_consent") !== "granted")
    return undefined;
  const ttclid = cookie(request, "stocksembly_ttclid");
  const ttp = cookie(request, "_ttp");
  return { ...(ttclid ? { ttclid } : {}), ...(ttp ? { ttp } : {}) };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

export class TikTokEventsApiError extends Error {
  constructor() {
    super("TIKTOK_EVENTS_API_FAILED");
    this.name = "TikTokEventsApiError";
  }
}

export async function sendTikTokPurchaseEvent(
  event: WhopWebhookEvent,
): Promise<boolean> {
  const pixelId = process.env["TIKTOK_PIXEL_ID"]?.trim();
  const token = process.env["TIKTOK_EVENTS_API_ACCESS_TOKEN"]?.trim();
  const testCode = process.env["TIKTOK_TEST_EVENT_CODE"]?.trim();
  if (event.type !== "payment.succeeded" || !pixelId || !token) return false;
  if (event.sourceEnvironment === "sandbox" && !testCode) return false;
  const data = record(event.data);
  if (data["billing_reason"] !== "subscription_create") return false;
  const metadata = {
    ...record(record(data["membership"])["metadata"]),
    ...record(data["metadata"]),
  };
  if (metadata["stocksembly_tiktok_consent"] !== "granted") return false;
  const paymentId = str(data["id"]);
  const principalId = str(metadata["stocksembly_principal_id"]);
  const currency = str(data["currency"])?.toUpperCase();
  const value = data["total"];
  const timestamp = Date.parse(event.timestamp ?? "");
  if (
    !paymentId ||
    !principalId ||
    !currency ||
    !/^[A-Z]{3}$/u.test(currency) ||
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    !Number.isFinite(timestamp)
  )
    return false;
  const ttclid = str(metadata["stocksembly_tiktok_ttclid"]);
  const ttp = str(metadata["stocksembly_tiktok_ttp"]);
  const payload = {
    event_source: "web",
    event_source_id: pixelId,
    data: [
      {
        event: "Purchase",
        event_time: Math.floor(timestamp / 1000),
        event_id: `whop:${event.sourceEnvironment ?? "production"}:${paymentId}`,
        user: {
          external_id: createHash("sha256").update(principalId).digest("hex"),
          ...(ttclid ? { ttclid } : {}),
          ...(ttp ? { ttp } : {}),
        },
        page: { url: "https://stocksembly.com/pricing" },
        properties: { currency, value, content_type: "product" },
      },
    ],
    ...(testCode ? { test_event_code: testCode } : {}),
  };
  const response = await fetch(
    "https://business-api.tiktok.com/open_api/v1.3/event/track/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": token },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7_000),
    },
  ).catch(() => undefined);
  if (!response?.ok) throw new TikTokEventsApiError();
  const result: unknown = await response.json().catch(() => undefined);
  if (record(result)["code"] !== 0) throw new TikTokEventsApiError();
  return true;
}

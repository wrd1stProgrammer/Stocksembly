import { createHash } from "node:crypto";
import {
  type BillingPlanKey,
  billingPlanAmount,
  type WhopWebhookEvent,
} from "../whop/server";
import type { MetaCheckoutAttribution } from "./contracts";

const META_CONSENT_COOKIE = "stocksembly_analytics_consent";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

function cookieValue(request: Request, name: string): string | undefined {
  const item = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (item === undefined) return undefined;
  const value = item.slice(name.length + 1).trim();
  return value.length > 0 && value.length <= 255 ? value : undefined;
}

export function metaCheckoutAttribution(
  request: Request,
): MetaCheckoutAttribution | undefined {
  if (cookieValue(request, META_CONSENT_COOKIE) !== "granted") return undefined;
  const fbp = cookieValue(request, "_fbp");
  const fbc = cookieValue(request, "_fbc");
  return {
    ...(fbp === undefined ? {} : { fbp }),
    ...(fbc === undefined ? {} : { fbc }),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function planKey(value: unknown): BillingPlanKey | undefined {
  return value === "pro-monthly" ||
    value === "pro-annual" ||
    value === "ultra-monthly" ||
    value === "ultra-annual"
    ? value
    : undefined;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function eventTime(value: string | undefined): number {
  const timestamp = value === undefined ? Number.NaN : Date.parse(value);
  return Math.floor(
    (Number.isFinite(timestamp) ? timestamp : Date.now()) / 1000,
  );
}

export class MetaConversionsApiError extends Error {
  constructor() {
    super("META_CONVERSIONS_API_FAILED");
    this.name = "MetaConversionsApiError";
  }
}

export async function sendMetaPurchaseEvent(
  event: WhopWebhookEvent,
): Promise<boolean> {
  if (event.type !== "payment.succeeded") return false;

  const pixelId = env("META_PIXEL_ID");
  const accessToken = env("META_CONVERSIONS_API_ACCESS_TOKEN");
  if (pixelId === undefined || accessToken === undefined) return false;

  const testEventCode = env("META_TEST_EVENT_CODE");
  if (event.sourceEnvironment === "sandbox" && testEventCode === undefined)
    return false;

  const data = record(event.data);
  const membership = record(data["membership"]);
  const metadata = record(membership["metadata"] ?? data["metadata"]);
  if (metadata["stocksembly_meta_consent"] !== "granted") return false;

  const plan = record(membership["plan"] ?? data["plan"]);
  const user = record(membership["user"] ?? data["user"]);
  const resolvedPlanKey = planKey(metadata["stocksembly_plan_key"]);
  const value =
    numberValue(data["total"]) ??
    numberValue(data["amount"]) ??
    numberValue(plan["initial_price"]) ??
    numberValue(plan["renewal_price"]) ??
    (resolvedPlanKey === undefined
      ? undefined
      : billingPlanAmount(resolvedPlanKey));
  if (value === undefined) return false;

  const principalId = stringValue(metadata["stocksembly_principal_id"]);
  const email = stringValue(user["email"] ?? data["email"]);
  if (principalId === undefined && email === undefined) return false;

  const graphVersion = env("META_GRAPH_API_VERSION") ?? "v25.0";
  const version = /^v\d+\.\d+$/u.test(graphVersion) ? graphVersion : "v25.0";
  const eventId = `whop:${event.sourceEnvironment ?? "production"}:${event.id ?? event.timestamp ?? "payment"}`;
  const origin = (
    env("STOCKSEMBLY_PUBLIC_ORIGIN") ?? "https://stocksembly.com"
  ).replace(/\/$/u, "");
  const fbp = stringValue(metadata["stocksembly_meta_fbp"]);
  const fbc = stringValue(metadata["stocksembly_meta_fbc"]);
  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime(event.timestamp),
        event_id: eventId,
        action_source: "website",
        event_source_url: `${origin}/pricing`,
        user_data: {
          ...(email === undefined ? {} : { em: [hash(email.toLowerCase())] }),
          ...(principalId === undefined
            ? {}
            : { external_id: [hash(principalId)] }),
          ...(fbp === undefined ? {} : { fbp }),
          ...(fbc === undefined ? {} : { fbc }),
        },
        custom_data: {
          currency: (stringValue(plan["currency"]) ?? "USD").toUpperCase(),
          value,
          ...(resolvedPlanKey === undefined
            ? {}
            : { content_name: resolvedPlanKey }),
          content_type: "product",
        },
      },
    ],
    ...(testEventCode === undefined ? {} : { test_event_code: testEventCode }),
  };

  const response = await fetch(
    `https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7_000),
    },
  ).catch(() => undefined);
  if (response?.ok !== true) throw new MetaConversionsApiError();
  return true;
}

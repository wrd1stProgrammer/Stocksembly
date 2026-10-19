import { afterEach, describe, expect, it, vi } from "vitest";
import type { WhopWebhookEvent } from "../whop/server";
import {
  googleCheckoutMetadata,
  googlePurchasePayload,
  sendGooglePurchase,
} from "./googleServer";

const now = Date.parse("2026-10-19T12:00:00Z");
const payment: WhopWebhookEvent = {
  id: "evt_test",
  type: "payment.succeeded",
  sourceEnvironment: "production",
  data: {
    id: "pay_test",
    total: "19",
    currency: "usd",
    metadata: {
      stocksembly_ga_consent: "granted",
      stocksembly_ga_client_id: "123.456",
      stocksembly_ga_session_id: String(now / 1000 - 60),
      stocksembly_plan_key: "pro-monthly",
    },
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Google checkout measurement", () => {
  it("requires consent and validates identifiers before persisting metadata", () => {
    const headers = {
      cookie: "stocksembly_analytics_consent=granted",
      "x-stocksembly-ga-client-id": "123.456",
      "x-stocksembly-ga-session-id": "1792411140",
    };
    expect(
      googleCheckoutMetadata(
        new Request("https://stocksembly.com", { headers }),
      ),
    ).toEqual({
      stocksembly_ga_consent: "granted",
      stocksembly_ga_client_id: "123.456",
      stocksembly_ga_session_id: "1792411140",
    });
    expect(
      googleCheckoutMetadata(
        new Request("https://stocksembly.com", {
          headers: {
            ...headers,
            cookie: "stocksembly_analytics_consent=denied",
          },
        }),
      ),
    ).toEqual({});
    expect(
      googleCheckoutMetadata(
        new Request("https://stocksembly.com", {
          headers: {
            ...headers,
            "x-stocksembly-ga-client-id": "person@example.com",
          },
        }),
      ),
    ).toEqual({});
  });
  it("uses actual revenue and the payment ID for deduplication", () => {
    expect(googlePurchasePayload(payment, now)).toMatchObject({
      client_id: "123.456",
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: "pay_test",
            value: 19,
            currency: "USD",
            session_id: now / 1000 - 60,
          },
        },
      ],
    });
    expect(googlePurchasePayload(payment, now)).toEqual(
      googlePurchasePayload({ ...payment, id: "retry_event" }, now),
    );
  });
  it("excludes sandbox, billing tests, missing amount, consent and non-payment events", () => {
    for (const invalid of [
      { ...payment, sourceEnvironment: "sandbox" as const },
      { ...payment, type: "membership.activated" },
      { ...payment, data: { id: "pay_test" } },
      {
        ...payment,
        data: {
          id: "pay_test",
          total: "19",
          currency: "USD",
          metadata: {
            stocksembly_ga_consent: "denied",
            stocksembly_ga_client_id: "123.456",
          },
        },
      },
      {
        ...payment,
        data: {
          id: "pay_test",
          total: "19",
          currency: "USD",
          metadata: {
            stocksembly_ga_consent: "granted",
            stocksembly_ga_client_id: "123.456",
            stocksembly_billing_test: "live-dollar",
          },
        },
      },
    ])
      expect(googlePurchasePayload(invalid, now)).toBeUndefined();
  });
  it("does not attribute a later renewal to the original checkout session", () => {
    expect(
      googlePurchasePayload(payment, now + 48 * 3600 * 1000)?.events[0]?.params,
    ).not.toHaveProperty("session_id");
  });
  it("is disabled without a server secret and never sends sandbox purchases", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GA4_MEASUREMENT_PROTOCOL_API_SECRET", "");
    expect(await sendGooglePurchase(payment)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    vi.stubEnv("GA4_MEASUREMENT_PROTOCOL_API_SECRET", "test-only");
    expect(
      await sendGooglePurchase({ ...payment, sourceEnvironment: "sandbox" }),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends only server-side and cannot prevent fulfillment on measurement failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    vi.stubEnv("GA4_MEASUREMENT_PROTOCOL_API_SECRET", "test-only");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendGooglePurchase(payment)).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0].pathname).toBe("/mp/collect");
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await sendGooglePurchase(payment)).toBe(false);
  });
});

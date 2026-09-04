import { afterEach, describe, expect, it, vi } from "vitest";
import { metaCheckoutAttribution, sendMetaPurchaseEvent } from "./server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Meta checkout attribution", () => {
  it("forwards Meta browser identifiers only with consent", () => {
    const request = new Request(
      "https://stocksembly.com/api/billing/checkout",
      {
        headers: {
          cookie:
            "stocksembly_analytics_consent=granted; _fbp=fb.1.123.456; _fbc=fb.1.123.click",
        },
      },
    );

    expect(metaCheckoutAttribution(request)).toEqual({
      fbp: "fb.1.123.456",
      fbc: "fb.1.123.click",
    });
    expect(
      metaCheckoutAttribution(
        new Request("https://stocksembly.com/api/billing/checkout", {
          headers: { cookie: "stocksembly_analytics_consent=denied" },
        }),
      ),
    ).toBeUndefined();
  });
});

describe("Meta Conversions API", () => {
  it("reports consented Whop purchases with value and matching data", async () => {
    vi.stubEnv("META_PIXEL_ID", "1941324473216410");
    vi.stubEnv("META_CONVERSIONS_API_ACCESS_TOKEN", "test-token");
    vi.stubEnv("META_GRAPH_API_VERSION", "v25.0");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendMetaPurchaseEvent({
        id: "evt_123",
        type: "payment.succeeded",
        timestamp: "2026-09-05T00:00:00.000Z",
        sourceEnvironment: "production",
        data: {
          amount: 19,
          membership: {
            metadata: {
              stocksembly_meta_consent: "granted",
              stocksembly_meta_fbp: "fb.1.123.456",
              stocksembly_meta_fbc: "fb.1.123.click",
              stocksembly_plan_key: "pro-monthly",
              stocksembly_principal_id: "principal-123",
            },
            plan: { currency: "usd" },
            user: { email: "Investor@example.com" },
          },
        },
      }),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(
      "/v25.0/1941324473216410/events?access_token=test-token",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.data[0]).toMatchObject({
      event_name: "Purchase",
      event_id: "whop:production:evt_123",
      custom_data: {
        currency: "USD",
        value: 19,
        content_name: "pro-monthly",
      },
      user_data: {
        fbp: "fb.1.123.456",
        fbc: "fb.1.123.click",
      },
    });
    expect(body.data[0].user_data.em[0]).toMatch(/^[a-f0-9]{64}$/u);
    expect(body.data[0].user_data.external_id[0]).toMatch(/^[a-f0-9]{64}$/u);
  });
});

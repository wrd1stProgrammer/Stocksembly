import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTikTokPurchaseEvent, tikTokCheckoutAttribution } from "./server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const paid = {
  type: "payment.succeeded",
  id: "evt_one",
  timestamp: "2026-10-25T00:00:00Z",
  data: {
    id: "pay_one",
    billing_reason: "subscription_create",
    total: 19,
    currency: "usd",
    metadata: {
      stocksembly_tiktok_consent: "granted",
      stocksembly_principal_id: "user-one",
      stocksembly_tiktok_ttclid: "click-one",
    },
  },
};
function configure() {
  vi.stubEnv("TIKTOK_PIXEL_ID", "DBEEGIRC77U5A2ME9FTG");
  vi.stubEnv("TIKTOK_EVENTS_API_ACCESS_TOKEN", "test-token");
  const send = vi.fn(
    async (_url: string, _options: RequestInit) => new Response('{"code":0}'),
  );
  vi.stubGlobal("fetch", send);
  return send;
}
describe("TikTok paid subscription reporting", () => {
  it("requires separate explicit consent before forwarding click IDs", () => {
    expect(
      tikTokCheckoutAttribution(
        new Request("https://stocksembly.com", {
          headers: {
            cookie:
              "stocksembly_analytics_consent=granted; stocksembly_ttclid=click-one",
          },
        }),
      ),
    ).toBeUndefined();
    expect(
      tikTokCheckoutAttribution(
        new Request("https://stocksembly.com", {
          headers: {
            cookie:
              "stocksembly_tiktok_consent=granted; stocksembly_ttclid=click-one; _ttp=visitor-one",
          },
        }),
      ),
    ).toEqual({ ttclid: "click-one", ttp: "visitor-one" });
  });
  it("uses actual paid value, hashes identity, and deduplicates by payment rather than delivery ID", async () => {
    const send = configure();
    await sendTikTokPurchaseEvent(paid);
    await sendTikTokPurchaseEvent({ ...paid, id: "evt_retry" });
    const payloads = send.mock.calls.map((call) =>
      JSON.parse(String(call[1].body)),
    );
    expect(payloads[0].data[0]).toMatchObject({
      event: "Purchase",
      event_id: "whop:production:pay_one",
      properties: { value: 19, currency: "USD" },
      user: { ttclid: "click-one" },
    });
    expect(payloads[0].data[0].user.external_id).toMatch(/^[a-f0-9]{64}$/u);
    expect(payloads[1].data[0].event_id).toBe(payloads[0].data[0].event_id);
    expect(JSON.stringify(payloads[0])).not.toContain("user-one");
  });
  it("does not report failed, free, renewed, unconsented or sandbox transactions as acquisitions", async () => {
    const send = configure();
    for (const event of [
      { ...paid, type: "payment.failed" },
      { ...paid, data: { ...paid.data, total: 0 } },
      { ...paid, data: { ...paid.data, billing_reason: "subscription_cycle" } },
      { ...paid, data: { ...paid.data, metadata: {} } },
      { ...paid, sourceEnvironment: "sandbox" as const },
    ])
      expect(await sendTikTokPurchaseEvent(event)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("treats HTTP 200 API rejection as retryable failure", async () => {
    const send = configure();
    send.mockResolvedValue(new Response('{"code":40002}'));
    await expect(sendTikTokPurchaseEvent(paid)).rejects.toThrow(
      "TIKTOK_EVENTS_API_FAILED",
    );
  });
});

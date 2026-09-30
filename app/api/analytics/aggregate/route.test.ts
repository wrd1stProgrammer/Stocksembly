import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/analytics/config", () => ({
  posthogEnabled: true,
  posthogHost: "https://us.i.posthog.com",
  posthogToken: "public-test",
}));
vi.mock("@/src/admin/adminAnalyticsFlags", () => ({
  adminAnalyticsWritesEnabled: () => true,
}));

import { POST } from "./route";

const input = {
  kind: "pageview",
  surface: "landing",
  source: "meta",
  device: "large_screen",
  visibleSeconds: 0,
  scrollDepth: 0,
};
function request(body: unknown = input, headers: Record<string, string> = {}) {
  return new Request("https://stocksembly.com/api/analytics/aggregate", {
    method: "POST",
    headers: {
      origin: "https://stocksembly.com",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
afterEach(() => vi.unstubAllGlobals());
describe("aggregate ingestion", () => {
  it("forwards no visitor headers and uses unrelated IDs for successive counts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request())).status).toBe(204);
    expect((await POST(request())).status).toBe(204);
    const first = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    const second = JSON.parse(fetchMock.mock.calls[1]?.[1].body);
    expect(first.properties.distinct_id).not.toBe(
      second.properties.distinct_id,
    );
    expect(first.properties).toMatchObject({
      $process_person_profile: false,
      $geoip_disable: true,
      $ip: null,
    });
    expect(fetchMock.mock.calls[0]?.[1].headers).toEqual({
      "content-type": "application/json",
    });
  });
  it("rejects untrusted origins and extra identifying fields", async () => {
    expect(
      (await POST(request(input, { origin: "https://elsewhere.test" }))).status,
    ).toBe(403);
    expect(
      (await POST(request({ ...input, email: "private@example.com" }))).status,
    ).toBe(400);
    expect((await POST(request("x".repeat(2000)))).status).toBe(413);
  });
  it("does not forward opt-out traffic", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await POST(request(input, { "sec-gpc": "1" }))).status).toBe(204);
    expect(
      (
        await POST(
          request(input, { cookie: "stocksembly_analytics_consent=denied" }),
        )
      ).status,
    ).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

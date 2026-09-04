import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAcquisitionAttribution = vi.hoisted(() =>
  vi.fn(async (request: Request) => {
    await request.clone().text();
    return Response.json({ stored: true });
  }),
);

vi.mock("@/src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => ({ recordAcquisitionAttribution }),
}));

import { POST } from "./route";

beforeEach(() => {
  recordAcquisitionAttribution.mockClear();
});

describe("POST /api/analytics/attribution", () => {
  it("preserves an unread request body for downstream policy enforcement", async () => {
    const response = await POST(
      new Request("https://stocksembly.com/api/analytics/attribution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "meta",
          medium: "paid_social",
          landingPath: "/",
          capturedAt: "2026-09-05T00:00:00.000Z",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(recordAcquisitionAttribution).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({ stored: true });
  });
});

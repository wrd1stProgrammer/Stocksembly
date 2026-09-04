import { beforeEach, describe, expect, it, vi } from "vitest";

const api = {
  onboardingState: vi.fn(),
  completeOnboarding: vi.fn(),
};

vi.mock("@/src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => api,
}));

import { GET, PUT } from "./route";

beforeEach(() => {
  api.onboardingState.mockReset();
  api.completeOnboarding.mockReset();
});

describe("account onboarding route", () => {
  it("returns the persisted onboarding state for the authenticated account", async () => {
    api.onboardingState.mockResolvedValue({
      authenticated: true,
      completed: false,
      version: 1,
    });

    const response = await GET(
      new Request("https://stocksembly.com/api/account/onboarding"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ completed: false, version: 1 });
  });

  it("persists completion for the current onboarding version", async () => {
    api.completeOnboarding.mockResolvedValue({
      authenticated: true,
      stored: true,
      version: 1,
    });

    const response = await PUT(
      new Request("https://stocksembly.com/api/account/onboarding", {
        method: "PUT",
        body: JSON.stringify({ version: 1, discoverySource: "social" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ stored: true, version: 1 });
    expect(api.completeOnboarding).toHaveBeenCalledWith(
      expect.any(Request),
      1,
      "social",
    );
  });

  it("rejects an unknown discovery source", async () => {
    const response = await PUT(
      new Request("https://stocksembly.com/api/account/onboarding", {
        method: "PUT",
        body: JSON.stringify({ version: 1, discoverySource: "made-up" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(api.completeOnboarding).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  adminAnalyticsOverview: vi.fn(),
  adminAnalyticsUsers: vi.fn(),
  adminAnalyticsUser: vi.fn(),
}));

vi.mock("@/src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => api,
}));

import { GET as overview } from "./overview/route";
import { GET as userDetail } from "./users/[principalId]/route";
import { GET as users } from "./users/route";

const outcomes = [
  ["unauthenticated", 401],
  ["forbidden", 403],
  ["not_found", 404],
  ["unavailable", 503],
] as const;

describe("admin analytics API route regression", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(outcomes)("keeps overview %s response", async (kind, status) => {
    api.adminAnalyticsOverview.mockResolvedValue({ kind });
    const response = await overview(
      new Request("http://localhost/api/admin/analytics/overview?range=30"),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each(outcomes)("keeps users %s response", async (kind, status) => {
    api.adminAnalyticsUsers.mockResolvedValue({ kind });
    const response = await users(
      new Request("http://localhost/api/admin/analytics/users?range=30"),
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each(outcomes)("keeps user detail %s response", async (kind, status) => {
    api.adminAnalyticsUser.mockResolvedValue({ kind });
    const response = await userDetail(
      new Request(
        "http://localhost/api/admin/analytics/users/principal?range=30",
      ),
      { params: Promise.resolve({ principalId: "principal" }) },
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each([
    [undefined, 50],
    ["1", 10],
    ["500", 100],
  ])(
    "keeps pageSize=%s within the 10-100 contract",
    async (value, expected) => {
      api.adminAnalyticsUsers.mockResolvedValue({ kind: "unavailable" });
      const url = new URL(
        "http://localhost/api/admin/analytics/users?range=30",
      );
      if (value) url.searchParams.set("pageSize", value);
      await users(new Request(url));
      expect(api.adminAnalyticsUsers.mock.calls.at(-1)?.[1].pageSize).toBe(
        expected,
      );
    },
  );

  it("returns a private 400 for an invalid date boundary", async () => {
    const response = await overview(
      new Request(
        "http://localhost/api/admin/analytics/overview?range=custom&fromDate=2026-01-01",
      ),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(api.adminAnalyticsOverview).not.toHaveBeenCalled();
  });
});

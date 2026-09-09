import { beforeEach, describe, expect, it, vi } from "vitest";

const credit = vi.hoisted(() => vi.fn());
vi.mock("@/src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => ({ consumeResearchRoomCredit: credit }),
}));

import { GET, POST } from "./route";

const reportId = "10000000-0000-4000-8000-000000000001";
const props = { params: Promise.resolve({ reportId }) };
beforeEach(() => {
  credit.mockReset();
  credit.mockResolvedValue({
    authenticated: true,
    allowed: true,
    remaining: 5,
    required: 3,
  });
});
describe("report credit confirmation", () => {
  it("checks without spending on GET", async () => {
    const request = new Request(
      `http://localhost/api/research-room/${reportId}/credit`,
    );
    const response = await GET(request, props);
    expect(credit).toHaveBeenCalledWith(request, reportId, true);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("spends only on explicit POST", async () => {
    const request = new Request(
      `http://localhost/api/research-room/${reportId}/credit`,
      { method: "POST" },
    );
    await POST(request, props);
    expect(credit).toHaveBeenCalledWith(request, reportId);
  });
});

import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  handle: vi.fn(),
  credit: vi.fn(),
  record: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@/src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => ({
    researchRoomAccess: mocks.access,
    handle: mocks.handle,
    consumeResearchRoomCredit: mocks.credit,
    recordReportRead: mocks.record,
  }),
}));
vi.mock("@/src/research/server/researchRoom/researchRoomCatalog", () => ({
  loadResearchRoomReport: mocks.load,
}));

import { POST } from "./route";

const reportId = "00000000-0000-4000-8000-000000000001";
const request = () =>
  new Request(`http://localhost/api/research-room/${reportId}/read`, {
    method: "POST",
    headers: { origin: "http://localhost" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ authenticated: true, tier: "paid" });
  mocks.handle.mockResolvedValue(new Response(null, { status: 404 }));
});
it("records free historical reads without consuming credits", async () => {
  mocks.load.mockResolvedValue({
    item: { publishedAt: "2020-01-01T00:00:00.000Z" },
  });
  expect(
    (await POST(request(), { params: Promise.resolve({ reportId }) })).status,
  ).toBe(204);
  expect(mocks.record).toHaveBeenCalledOnce();
  expect(mocks.credit).not.toHaveBeenCalled();
});
it("does not mark a paywall or forged cross-origin request as read", async () => {
  mocks.load.mockResolvedValue("locked");
  expect(
    (await POST(request(), { params: Promise.resolve({ reportId }) })).status,
  ).toBe(403);
  expect(mocks.record).not.toHaveBeenCalled();
  expect(
    (
      await POST(
        new Request(request(), {
          headers: { origin: "https://attacker.invalid" },
        }),
        { params: Promise.resolve({ reportId }) },
      )
    ).status,
  ).toBe(403);
});
it("checks paid access without issuing a debit", async () => {
  mocks.load.mockResolvedValue({
    item: { publishedAt: new Date().toISOString() },
  });
  mocks.credit.mockResolvedValue({ allowed: true, required: 3 });
  expect(
    (await POST(request(), { params: Promise.resolve({ reportId }) })).status,
  ).toBe(403);
  expect(mocks.credit).toHaveBeenCalledWith(
    expect.any(Request),
    reportId,
    true,
  );
  expect(mocks.record).not.toHaveBeenCalled();
});

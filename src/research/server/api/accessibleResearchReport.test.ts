import { beforeEach, expect, it, vi } from "vitest";
import { workflowV3PresentationFixture } from "../../workflowV3Presentation.testSupport";
import { loadAccessibleResearchReport } from "./accessibleResearchReport";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  room: vi.fn(),
  access: vi.fn(),
  credit: vi.fn(),
}));
vi.mock("./liveResearchApi", () => ({
  getLiveResearchApi: async () => ({
    handle: mocks.handle,
    researchRoomAccess: mocks.access,
    consumeResearchRoomCredit: mocks.credit,
  }),
}));
vi.mock("../researchRoom/researchRoomCatalog", () => ({
  loadResearchRoomReport: mocks.room,
}));
const report = workflowV3PresentationFixture("ko");
const request = new Request(
  `http://localhost/api/research/reports/${report.reportId}/technical-chart`,
);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.handle.mockResolvedValue(
    Response.json({ error: "NOT_FOUND" }, { status: 404 }),
  );
  mocks.access.mockResolvedValue({ authenticated: true, tier: "pro" });
  mocks.credit.mockResolvedValue({ authenticated: true, allowed: true });
});
it("preserves owner access without charging for room access", async () => {
  mocks.handle.mockResolvedValue(Response.json({ report }));
  expect(await loadAccessibleResearchReport(request, report.reportId)).toEqual({
    report,
  });
  expect(mocks.room).not.toHaveBeenCalled();
  expect(mocks.credit).not.toHaveBeenCalled();
});
it.each(["locked", "credit_denied", "allowed"])(
  "applies existing membership and view-credit rules for a room viewer: %s",
  async (mode) => {
    const room = {
      report,
      item: { symbol: "TEST", publishedAt: new Date().toISOString() },
    };
    mocks.room.mockResolvedValue(mode === "locked" ? "locked" : room);
    if (mode === "credit_denied")
      mocks.credit.mockResolvedValue({ authenticated: true, allowed: false });
    const result = await loadAccessibleResearchReport(request, report.reportId);
    if (mode === "allowed") {
      expect(result).toEqual({
        report,
        symbol: "TEST",
        createdAt: room.item.publishedAt,
      });
      expect(mocks.credit).toHaveBeenCalledWith(request, report.reportId);
    } else {
      expect(result).toBeInstanceOf(Response);
      if (!(result instanceof Response))
        throw new Error("expected access rejection");
      expect(result.status).toBe(mode === "locked" ? 403 : 402);
      if (mode === "locked") expect(mocks.credit).not.toHaveBeenCalled();
    }
  },
);
it("permits mature public reports without a view debit", async () => {
  mocks.access.mockResolvedValue({ authenticated: false, tier: "free" });
  mocks.room.mockResolvedValue({
    report,
    item: { symbol: "TEST", publishedAt: "2020-01-01T00:00:00Z" },
  });
  const result = await loadAccessibleResearchReport(request, report.reportId);
  expect(result).not.toBeInstanceOf(Response);
  expect(mocks.credit).not.toHaveBeenCalled();
});

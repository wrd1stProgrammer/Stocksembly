import { beforeEach, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  list: vi.fn(),
  lookup: vi.fn(),
  search: vi.fn(),
  access: vi.fn(),
}));
vi.mock("@/src/research/server/api/liveResearchApi", () => ({
  getLiveResearchApi: async () => ({ researchRoomAccess: fixtures.access }),
}));
vi.mock("@/src/research/server/api/liveTickerCatalog", () => ({
  getLiveTickerCatalog: async () => ({
    lookup: fixtures.lookup,
    search: fixtures.search,
  }),
}));
vi.mock("@/src/research/server/researchRoom/researchRoomCatalog", () => ({
  listLandingResearchRoomReports: fixtures.list,
}));
vi.mock("./pageRequest", () => ({ requestFromPage: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it("shares public metadata but recomputes each visitor's lock without searching or writing company data", async () => {
  fixtures.list.mockResolvedValue([
    {
      reportId: "report-1",
      symbol: "NVDA",
      question: "Public research question",
      locale: "en",
      researchTarget: { kind: "committee" },
      publishedAt: new Date().toISOString(),
      status: "complete",
      locked: true,
      viewCount: 0,
    },
  ]);
  fixtures.lookup.mockResolvedValue({
    kind: "resolved",
    symbol: { company: "NVIDIA" },
  });
  const { loadLandingResearchRoomPreview } = await import(
    "./landingResearchRoomPreview"
  );
  const member = await loadLandingResearchRoomPreview("en", {
    authenticated: true,
    tier: "free",
  });
  const guest = await loadLandingResearchRoomPreview("en", {
    authenticated: false,
    tier: "free",
  });
  expect(member.reports[0]?.locked).toBe(false);
  expect(guest.reports[0]?.locked).toBe(true);
  expect(fixtures.list).toHaveBeenCalledTimes(1);
  expect(fixtures.lookup).toHaveBeenCalledTimes(1);
  expect(fixtures.search).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from "vitest";
import {
  demoReportFile,
  isRecentDemo,
} from "../../../components/onboarding/researchDemo";
import { recordedResearchDemo, selectResearchDemo } from "./researchDemo";

const catalog = vi.hoisted(() => ({ list: vi.fn(), load: vi.fn() }));
vi.mock("../researchRoom/researchRoomCatalog", () => ({
  listResearchRoomReports: catalog.list,
  loadResearchRoomReport: catalog.load,
}));
beforeEach(() => {
  vi.clearAllMocks();
});

it("selects the newest completed public committee report within 30 days", async () => {
  const sample = recordedResearchDemo();
  const publishedAt = new Date(Date.now() - 86400000).toISOString();
  catalog.list.mockResolvedValue([{ reportId: sample.reportId, publishedAt }]);
  catalog.load.mockResolvedValue({
    item: {
      reportId: sample.reportId,
      symbol: "TSLA",
      publishedAt,
      locale: "ko",
      question: sample.question,
    },
    file: demoReportFile(sample),
    company: sample.company,
    runDetail: sample.runDetail,
  });
  const result = await selectResearchDemo("TSLA");
  expect(catalog.list).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      company: "TSLA",
      scope: "committee",
      sort: "latest",
      limit: 1,
    }),
  );
  expect(result.publishedAt).toBe(publishedAt);
  expect(result.runDetail.events).toEqual(sample.runDetail.events);
  expect(result).not.toHaveProperty("file");
  expect(result).not.toHaveProperty("conversation");
});

it("uses the clearly identified recorded sample when there is no recent report", async () => {
  catalog.list.mockResolvedValue([]);
  expect((await selectResearchDemo("PLTR")).symbol).toBe("TSLA");
  expect(catalog.load).not.toHaveBeenCalled();
  catalog.list.mockResolvedValue([
    {
      reportId: recordedResearchDemo().reportId,
      publishedAt: "2020-01-01T00:00:00Z",
    },
  ]);
  expect((await selectResearchDemo("TSLA")).publishedAt).toBe(
    recordedResearchDemo().publishedAt,
  );
  expect(catalog.load).not.toHaveBeenCalled();
});

it("includes the 30-day boundary and excludes future or invalid dates", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  expect(isRecentDemo("2026-09-19T00:00:00Z", now)).toBe(true);
  expect(isRecentDemo("2026-09-18T23:59:59Z", now)).toBe(false);
  expect(isRecentDemo("2026-10-20T00:00:00Z", now)).toBe(false);
  expect(isRecentDemo("invalid", now)).toBe(false);
});

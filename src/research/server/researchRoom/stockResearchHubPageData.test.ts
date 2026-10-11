import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StockSymbolSchema } from "./researchRoomPublicCatalog";
import { getStockResearchHubPageData } from "./stockResearchHubPageData";

const pageDataState = vi.hoisted(() => ({
  loadStockResearchHub: vi.fn(),
  loadResearchRoomReport: vi.fn(),
}));

vi.mock("./stockResearchHubCatalog", () => ({
  loadStockResearchHub: pageDataState.loadStockResearchHub,
}));

vi.mock("./researchRoomCatalog", () => ({
  loadResearchRoomReport: pageDataState.loadResearchRoomReport,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T00:00:00.000Z"));
  vi.clearAllMocks();
});

afterEach(() => vi.useRealTimers());

describe("stock research hub page data", () => {
  it("normalizes a route symbol before loading its public hub", async () => {
    // Given
    const hub = {
      symbol: StockSymbolSchema.parse("NVDA"),
      company: "NVIDIA Corporation",
      latestPublishedAt: "2026-08-03T00:00:00.000Z",
      reports: [],
    };
    pageDataState.loadStockResearchHub.mockResolvedValueOnce(hub);

    // When
    const result = await getStockResearchHubPageData("nvda");

    // Then
    expect(result).toBe(hub);
    expect(pageDataState.loadStockResearchHub).toHaveBeenCalledWith("NVDA");
  });

  it("rejects a malformed route symbol before any database read", async () => {
    // Given
    // When
    const result = await getStockResearchHubPageData("NVDA<script>");

    // Then
    expect(result).toBeUndefined();
    expect(pageDataState.loadStockResearchHub).not.toHaveBeenCalled();
  });
});

const report = {
  reportId: "00000000-0000-4000-8000-000000000001",
  question: "Existing published question",
  locale: "ko" as const,
  researchTarget: { kind: "committee" as const },
  publishedAt: "2026-08-03T00:00:00.000Z",
  status: "complete" as const,
};
const publicHub = {
  symbol: StockSymbolSchema.parse("NVDA"),
  company: "NVIDIA Corporation",
  latestPublishedAt: report.publishedAt,
  reports: [report, { ...report, reportId: "older-report" }],
};
const bundle = {
  item: { ...report, locked: false },
  file: {
    thesis: { en: "English thesis", ko: "공개 원문 발췌" },
    evidenceIndex: [{ title: "Filing", url: "https://example.com/filing" }],
  },
};

describe("public report excerpts", () => {
  beforeEach(() => {
    pageDataState.loadStockResearchHub.mockResolvedValue(publicHub);
    pageDataState.loadResearchRoomReport.mockResolvedValue(bundle);
  });

  it("loads only the latest report through anonymous free access", async () => {
    const result = await getStockResearchHubPageData("NVDA");
    expect(
      pageDataState.loadResearchRoomReport,
    ).toHaveBeenCalledExactlyOnceWith(
      report.reportId,
      { authenticated: false, tier: "free" },
      new Date("2026-10-11T00:00:00.000Z"),
    );
    expect(result?.reports[0]?.summary).toEqual({
      text: "공개 원문 발췌",
      locale: "ko",
      sources: bundle.file.evidenceIndex,
    });
    expect(result?.reports[1]?.summary).toBeUndefined();
    expect(result).not.toHaveProperty("file");
  });

  it.each(["locked", undefined])(
    "omits unavailable access result %s",
    async (value) => {
      pageDataState.loadResearchRoomReport.mockResolvedValue(value);
      expect(await getStockResearchHubPageData("NVDA")).toBe(publicHub);
      expect(pageDataState.loadResearchRoomReport).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves the archive if artifact loading fails", async () => {
    pageDataState.loadResearchRoomReport.mockRejectedValue(
      new Error("Missing artifact"),
    );
    expect(await getStockResearchHubPageData("NVDA")).toBe(publicHub);
  });

  it("omits an empty original-language thesis without substituting another language", async () => {
    pageDataState.loadResearchRoomReport.mockResolvedValue({
      ...bundle,
      file: { ...bundle.file, thesis: { en: "Other language", ko: "  " } },
    });
    expect(await getStockResearchHubPageData("NVDA")).toBe(publicHub);
  });

  it("does not read reports younger than 30 days", async () => {
    const recent = {
      ...publicHub,
      reports: [
        {
          ...report,
          publishedAt: new Date(Date.now() - 30 * 86400000 + 1).toISOString(),
        },
      ],
    };
    pageDataState.loadStockResearchHub.mockResolvedValue(recent);
    expect(await getStockResearchHubPageData("NVDA")).toBe(recent);
    expect(pageDataState.loadResearchRoomReport).not.toHaveBeenCalled();
  });

  it("allows a publication at exactly the 30-day boundary", async () => {
    const mature = {
      ...report,
      publishedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    };
    pageDataState.loadStockResearchHub.mockResolvedValue({
      ...publicHub,
      reports: [mature],
    });
    pageDataState.loadResearchRoomReport.mockResolvedValue({
      ...bundle,
      item: { ...mature, locked: false },
    });
    expect(
      (await getStockResearchHubPageData("NVDA"))?.reports[0]?.summary,
    ).toBeDefined();
  });

  it.each([
    { ...bundle.item, locked: true },
    { ...bundle.item, publishedAt: "2026-10-10T00:00:00.000Z" },
    { ...bundle.item, reportId: "different-report" },
  ])("rejects changed or inaccessible publication metadata", async (item) => {
    pageDataState.loadResearchRoomReport.mockResolvedValue({ ...bundle, item });
    expect(await getStockResearchHubPageData("NVDA")).toBe(publicHub);
  });

  it("caps the original excerpt without splitting Unicode characters", async () => {
    pageDataState.loadResearchRoomReport.mockResolvedValue({
      ...bundle,
      file: { ...bundle.file, thesis: { en: "", ko: "𠮷".repeat(600) } },
    });
    const text =
      (await getStockResearchHubPageData("NVDA"))?.reports[0]?.summary?.text ??
      "";
    expect(Array.from(text)).toHaveLength(420);
    expect(text).toBe(`${"𠮷".repeat(419)}…`);
  });

  it("filters unsafe and duplicate sources and retains at most three HTTP(S) links", async () => {
    pageDataState.loadResearchRoomReport.mockResolvedValue({
      ...bundle,
      file: {
        ...bundle.file,
        evidenceIndex: [
          { title: "Missing" },
          ...[
            "javascript:alert(1)",
            "data:text/html,test",
            "/relative",
            "invalid",
            "https://user:pass@example.com",
            "https://example.com/a",
            "https://example.com/a",
            "http://example.com/b",
            "https://example.com/c",
            "https://example.com/d",
          ].map((url) => ({ title: "Source", url })),
        ],
      },
    });
    const sources = (await getStockResearchHubPageData("NVDA"))?.reports[0]
      ?.summary?.sources;
    expect(sources?.map((source) => source.url)).toEqual([
      "https://example.com/a",
      "http://example.com/b",
      "https://example.com/c",
    ]);
  });
});

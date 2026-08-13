import { beforeEach, describe, expect, it, vi } from "vitest";
import sitemap from "./sitemap";

const sitemapState = vi.hoisted(() => ({
  listResearchRoomSitemapEntries: vi.fn(),
  listStockResearchHubSitemapEntries: vi.fn(),
}));

vi.mock("@/src/research/server/researchRoom/researchRoomCatalog", () => ({
  listResearchRoomSitemapEntries: sitemapState.listResearchRoomSitemapEntries,
}));

vi.mock("@/src/research/server/researchRoom/stockResearchHubCatalog", () => ({
  listStockResearchHubSitemapEntries:
    sitemapState.listStockResearchHubSitemapEntries,
}));

beforeEach(() => {
  vi.clearAllMocks();
  sitemapState.listResearchRoomSitemapEntries.mockResolvedValue([]);
  sitemapState.listStockResearchHubSitemapEntries.mockResolvedValue([]);
});

describe("stock research hub sitemap URLs", () => {
  it("adds one localized ticker hub pair for each eligible company", async () => {
    // Given
    sitemapState.listStockResearchHubSitemapEntries.mockResolvedValueOnce([
      { symbol: "NVDA", lastModified: "2026-06-02T12:00:00.000Z" },
      { symbol: "AAPL", lastModified: "2026-05-31T12:00:00.000Z" },
    ]);

    // When
    const entries = await sitemap();

    // Then
    expect(entries.filter((entry) => entry.url.includes("/stocks/"))).toEqual([
      {
        url: "https://stocksembly.com/ko/stocks/nvda",
        lastModified: "2026-06-02T12:00:00.000Z",
        changeFrequency: "weekly",
        priority: 0.8,
      },
      {
        url: "https://stocksembly.com/en/stocks/nvda",
        lastModified: "2026-06-02T12:00:00.000Z",
        changeFrequency: "weekly",
        priority: 0.8,
      },
      {
        url: "https://stocksembly.com/ko/stocks/aapl",
        lastModified: "2026-05-31T12:00:00.000Z",
        changeFrequency: "weekly",
        priority: 0.8,
      },
      {
        url: "https://stocksembly.com/en/stocks/aapl",
        lastModified: "2026-05-31T12:00:00.000Z",
        changeFrequency: "weekly",
        priority: 0.8,
      },
    ]);
  });

  it("keeps report URLs when only the ticker hub projection fails", async () => {
    // Given
    const failure = new Error("hub projection unavailable");
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sitemapState.listResearchRoomSitemapEntries.mockResolvedValueOnce([
      {
        reportId: "00000000-0000-4000-8000-000000000001",
        publishedAt: "2026-06-01T12:00:00.000Z",
      },
    ]);
    sitemapState.listStockResearchHubSitemapEntries.mockRejectedValueOnce(
      failure,
    );

    // When
    const entries = await sitemap();

    // Then
    expect(entries.map((entry) => entry.url)).toContain(
      "https://stocksembly.com/research-room/00000000-0000-4000-8000-000000000001",
    );
    expect(entries.some((entry) => entry.url.includes("/stocks/"))).toBe(false);
    expect(error).toHaveBeenCalledWith(
      "[sitemap] failed to load stock research hub entries",
      failure,
    );
  });
});

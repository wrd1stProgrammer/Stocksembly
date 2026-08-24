import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editorialDefinitions } from "@/src/editorial/catalog";
import { locales } from "@/src/lib/i18n";
import sitemap, { dynamic } from "./sitemap";

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

function sitemapEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    reportId: `report-${String(index + 1).padStart(3, "0")}`,
    publishedAt: `2026-06-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
  }));
}

beforeEach(() => {
  sitemapState.listResearchRoomSitemapEntries.mockReset();
  sitemapState.listResearchRoomSitemapEntries.mockResolvedValue([]);
  sitemapState.listStockResearchHubSitemapEntries.mockReset();
  sitemapState.listStockResearchHubSitemapEntries.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sitemap", () => {
  it("forces request-time sitemap rendering", () => {
    // Given
    // When
    // Then
    expect(dynamic).toBe("force-dynamic");
  });

  it("lists localized public and editorial pages with real editorial dates", async () => {
    // When
    const entries = await sitemap();

    // Then
    const urls = entries.map((entry) => entry.url);
    expect(urls).not.toContain("https://stocksembly.com");
    expect(urls).toContain("https://stocksembly.com/research-room");
    expect(urls).toContain("https://stocksembly.com/contact");
    for (const locale of locales) {
      expect(urls).toContain(`https://stocksembly.com/${locale}`);
      expect(urls).toContain(`https://stocksembly.com/${locale}/blog`);
      expect(urls).toContain(`https://stocksembly.com/${locale}/glossary`);
    }
    const editorialEntryUrls = entries.filter((entry) =>
      editorialDefinitions.some(({ kind, slug }) =>
        entry.url.endsWith(`/${kind}/${slug}`),
      ),
    );
    expect(editorialEntryUrls).toHaveLength(
      locales.length * editorialDefinitions.length,
    );
    expect(editorialEntryUrls[0]).toMatchObject({
      lastModified: editorialDefinitions[0]?.modifiedAt,
      changeFrequency: "monthly",
    });
  });

  it("adds canonical public report entries from the catalog", async () => {
    // Given
    const catalogEntries = [
      {
        reportId: "00000000-0000-4000-8000-000000000001",
        publishedAt: "2026-06-01T12:00:00.000Z",
      },
      {
        reportId: "00000000-0000-4000-8000-000000000002",
        publishedAt: "2026-06-02T12:00:00.000Z",
      },
    ];
    sitemapState.listResearchRoomSitemapEntries.mockResolvedValueOnce(
      catalogEntries,
    );

    // When
    const entries = await sitemap();

    // Then
    expect(
      entries.filter((entry) => entry.url.includes("/research-room/")),
    ).toEqual([
      {
        url: "https://stocksembly.com/research-room/00000000-0000-4000-8000-000000000001",
        lastModified: "2026-06-01T12:00:00.000Z",
        changeFrequency: "weekly",
        priority: 0.8,
      },
      {
        url: "https://stocksembly.com/research-room/00000000-0000-4000-8000-000000000002",
        lastModified: "2026-06-02T12:00:00.000Z",
        changeFrequency: "weekly",
        priority: 0.8,
      },
    ]);
  });

  it("includes all 81 eligible catalog entries", async () => {
    // Given
    const catalogEntries = sitemapEntries(81);
    sitemapState.listResearchRoomSitemapEntries.mockResolvedValueOnce(
      catalogEntries,
    );

    // When
    const entries = await sitemap();

    // Then
    const reportEntries = entries.filter((entry) =>
      entry.url.includes("/research-room/"),
    );
    expect(reportEntries).toHaveLength(81);
    expect(reportEntries.map((entry) => entry.url)).toEqual(
      catalogEntries.map(
        (entry) => `https://stocksembly.com/research-room/${entry.reportId}`,
      ),
    );
  });

  it("refreshes report URLs from the catalog on each invocation", async () => {
    // Given
    sitemapState.listResearchRoomSitemapEntries
      .mockResolvedValueOnce([
        {
          reportId: "00000000-0000-4000-8000-000000000001",
          publishedAt: "2026-06-01T12:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          reportId: "00000000-0000-4000-8000-000000000002",
          publishedAt: "2026-06-02T12:00:00.000Z",
        },
      ]);

    // When
    const firstEntries = await sitemap();
    const secondEntries = await sitemap();

    // Then
    expect(
      firstEntries
        .filter((entry) => entry.url.includes("/research-room/"))
        .map((entry) => entry.url),
    ).toEqual([
      "https://stocksembly.com/research-room/00000000-0000-4000-8000-000000000001",
    ]);
    expect(
      secondEntries
        .filter((entry) => entry.url.includes("/research-room/"))
        .map((entry) => entry.url),
    ).toEqual([
      "https://stocksembly.com/research-room/00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("returns static entries and logs an identifiable error when the catalog fails", async () => {
    // Given
    const staticEntries = await sitemap();
    const failure = new Error("catalog unavailable");
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sitemapState.listResearchRoomSitemapEntries.mockRejectedValueOnce(failure);

    // When
    const entries = await sitemap();

    // Then
    expect(entries).toEqual(staticEntries);
    expect(error).toHaveBeenCalledWith(
      "[sitemap] failed to load research room entries",
      failure,
    );
  });
});

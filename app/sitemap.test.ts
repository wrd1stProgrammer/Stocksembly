import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sitemap, { dynamic } from "./sitemap";

const sitemapState = vi.hoisted(() => ({
  listResearchRoomSitemapEntries: vi.fn(),
}));

vi.mock("@/src/research/server/researchRoom/researchRoomCatalog", () => ({
  listResearchRoomSitemapEntries: sitemapState.listResearchRoomSitemapEntries,
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

  it("lists only public static pages without fabricated modification dates", async () => {
    // Given
    const staticUrls = [
      "https://stocksembly.com",
      "https://stocksembly.com/research-room",
      "https://stocksembly.com/about",
      "https://stocksembly.com/methodology",
      "https://stocksembly.com/editorial-policy",
      "https://stocksembly.com/corrections",
      "https://stocksembly.com/terms",
      "https://stocksembly.com/privacy",
      "https://stocksembly.com/disclaimer",
      "https://stocksembly.com/risk-disclosure",
    ];

    // When
    const entries = await sitemap();

    // Then
    expect(entries).toHaveLength(staticUrls.length);
    expect(entries.map((entry) => entry.url)).toEqual(staticUrls);
    expect(entries).toEqual([
      expect.objectContaining({
        url: "https://stocksembly.com",
        changeFrequency: "weekly",
        priority: 1,
      }),
      expect.objectContaining({
        url: "https://stocksembly.com/research-room",
        changeFrequency: "daily",
        priority: 0.9,
      }),
      ...[
        ["about", 0.6],
        ["methodology", 0.7],
        ["editorial-policy", 0.6],
        ["corrections", 0.5],
        ["terms", 0.3],
        ["privacy", 0.3],
        ["disclaimer", 0.3],
        ["risk-disclosure", 0.3],
      ].map(([path, priority]) =>
        expect.objectContaining({
          url: `https://stocksembly.com/${path}`,
          changeFrequency: "monthly",
          priority,
        }),
      ),
    ]);
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
      true,
    );
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
    expect(entries.slice(10)).toEqual([
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
    expect(entries.slice(10)).toHaveLength(81);
    expect(entries.slice(10).map((entry) => entry.url)).toEqual(
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
    expect(firstEntries.slice(10).map((entry) => entry.url)).toEqual([
      "https://stocksembly.com/research-room/00000000-0000-4000-8000-000000000001",
    ]);
    expect(secondEntries.slice(10).map((entry) => entry.url)).toEqual([
      "https://stocksembly.com/research-room/00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("returns static entries and logs an identifiable error when the catalog fails", async () => {
    // Given
    const failure = new Error("catalog unavailable");
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sitemapState.listResearchRoomSitemapEntries.mockRejectedValueOnce(failure);

    // When
    const entries = await sitemap();

    // Then
    expect(entries).toHaveLength(10);
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://stocksembly.com",
      "https://stocksembly.com/research-room",
      "https://stocksembly.com/about",
      "https://stocksembly.com/methodology",
      "https://stocksembly.com/editorial-policy",
      "https://stocksembly.com/corrections",
      "https://stocksembly.com/terms",
      "https://stocksembly.com/privacy",
      "https://stocksembly.com/disclaimer",
      "https://stocksembly.com/risk-disclosure",
    ]);
    expect(error).toHaveBeenCalledWith(
      "[sitemap] failed to load research room entries",
      failure,
    );
  });
});

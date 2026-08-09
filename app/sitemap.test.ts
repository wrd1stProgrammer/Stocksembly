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

  it("characterizes the current static URL set and shape", async () => {
    // Given
    const staticUrls = [
      "https://stocksembly.com",
      "https://stocksembly.com/research-room",
      "https://stocksembly.com/terms",
      "https://stocksembly.com/privacy",
      "https://stocksembly.com/disclaimer",
      "https://stocksembly.com/risk-disclosure",
      "https://stocksembly.com/login",
      "https://stocksembly.com/signup",
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
        lastModified: expect.any(Date),
      }),
      expect.objectContaining({
        url: "https://stocksembly.com/research-room",
        changeFrequency: "daily",
        priority: 0.9,
        lastModified: expect.any(Date),
      }),
      ...[
        ["terms", 0.3],
        ["privacy", 0.3],
        ["disclaimer", 0.3],
        ["risk-disclosure", 0.3],
        ["login", 0.4],
        ["signup", 0.4],
      ].map(([path, priority]) =>
        expect.objectContaining({
          url: `https://stocksembly.com/${path}`,
          changeFrequency: "monthly",
          priority,
          lastModified: expect.any(Date),
        }),
      ),
    ]);
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
    expect(entries.slice(8)).toEqual([
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
    expect(entries.slice(8)).toHaveLength(81);
    expect(entries.slice(8).map((entry) => entry.url)).toEqual(
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
    expect(firstEntries.slice(8).map((entry) => entry.url)).toEqual([
      "https://stocksembly.com/research-room/00000000-0000-4000-8000-000000000001",
    ]);
    expect(secondEntries.slice(8).map((entry) => entry.url)).toEqual([
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
    expect(entries).toHaveLength(8);
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://stocksembly.com",
      "https://stocksembly.com/research-room",
      "https://stocksembly.com/terms",
      "https://stocksembly.com/privacy",
      "https://stocksembly.com/disclaimer",
      "https://stocksembly.com/risk-disclosure",
      "https://stocksembly.com/login",
      "https://stocksembly.com/signup",
    ]);
    expect(error).toHaveBeenCalledWith(
      "[sitemap] failed to load research room entries",
      failure,
    );
  });
});

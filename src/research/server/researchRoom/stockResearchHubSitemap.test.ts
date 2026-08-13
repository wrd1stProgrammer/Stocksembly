import { afterEach, describe, expect, it } from "vitest";
import { listStockResearchHubSitemapEntries } from "./stockResearchHubCatalog";
import {
  cleanupStockHubFixtures,
  createStockHubFixture,
  STOCK_HUB_NOW,
  stockHubFixtureId,
} from "./stockResearchHubCatalog.testFixture";

afterEach(cleanupStockHubFixtures);

describe("stock research hub sitemap projection", () => {
  it("lists each symbol once using its latest mature publication", async () => {
    // Given
    await createStockHubFixture([
      {
        reportId: stockHubFixtureId("23000000", 1),
        symbol: "NVDA",
        company: "NVIDIA Corporation",
        question: "Latest mature NVDA report",
        locale: "en",
        researchKind: "committee",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-03T00:00:00.000Z",
          },
        ],
      },
      {
        reportId: stockHubFixtureId("23000000", 2),
        symbol: "NVDA",
        company: "NVIDIA Corporation",
        question: "Older NVDA report",
        locale: "ko",
        researchKind: "department",
        departmentId: "company",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
      {
        reportId: stockHubFixtureId("23000000", 3),
        symbol: "PLTR",
        company: "Palantir Technologies Inc.",
        question: "Palantir public report",
        locale: "en",
        researchKind: "committee",
        versions: [
          {
            version: 1,
            status: "complete_with_limitations",
            publishedAt: "2026-08-02T00:00:00.000Z",
          },
        ],
      },
      {
        reportId: stockHubFixtureId("23000000", 4),
        symbol: "AAPL",
        company: "Apple Inc.",
        question: "Recent report must stay absent",
        locale: "en",
        researchKind: "committee",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-03T00:00:00.001Z",
          },
        ],
      },
    ]);

    // When
    const entries = await listStockResearchHubSitemapEntries(STOCK_HUB_NOW);

    // Then
    expect(entries).toEqual([
      { symbol: "NVDA", lastModified: "2026-08-03T00:00:00.000Z" },
      { symbol: "PLTR", lastModified: "2026-08-02T00:00:00.000Z" },
    ]);
  });
});

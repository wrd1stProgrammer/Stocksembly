import { afterEach, describe, expect, it } from "vitest";
import { StockSymbolSchema } from "./researchRoomPublicCatalog";
import { loadStockResearchHub } from "./stockResearchHubCatalog";
import {
  cleanupStockHubFixtures,
  createStockHubFixture,
  STOCK_HUB_NOW,
  stockHubFixtureId,
} from "./stockResearchHubCatalog.testFixture";

afterEach(cleanupStockHubFixtures);

describe("stock research hub catalog", () => {
  it("returns only mature public reports from each absolute latest version", async () => {
    // Given
    await createStockHubFixture([
      {
        reportId: stockHubFixtureId("20000000", 1),
        symbol: "NVDA",
        company: "NVIDIA Corporation",
        question: "How durable is data-center demand?",
        locale: "en",
        researchKind: "committee",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
          {
            version: 2,
            status: "complete_with_limitations",
            publishedAt: "2026-08-03T00:00:00.000Z",
          },
        ],
      },
      {
        reportId: stockHubFixtureId("20000000", 2),
        symbol: "NVDA",
        company: "NVIDIA Corporation",
        question: "마진의 핵심 변수를 분석해줘",
        locale: "ko",
        researchKind: "department",
        departmentId: "financial",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-02T00:00:00.000Z",
          },
        ],
      },
      {
        reportId: stockHubFixtureId("20000000", 3),
        symbol: "NVDA",
        company: "NVIDIA Corporation",
        question: "This report is still recent",
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
      {
        reportId: stockHubFixtureId("20000000", 4),
        symbol: "NVDA",
        company: "NVIDIA Corporation",
        question: "An older complete version must not leak",
        locale: "en",
        researchKind: "committee",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
          },
          {
            version: 2,
            status: "incomplete",
            publishedAt: "2026-08-09T00:00:00.000Z",
          },
        ],
      },
      {
        reportId: stockHubFixtureId("20000000", 5),
        symbol: "NVDA",
        company: "NVIDIA Corporation",
        question: "A missing artifact must not appear",
        locale: "en",
        researchKind: "committee",
        versions: [
          {
            version: 1,
            status: "complete",
            publishedAt: "2026-08-01T00:00:00.000Z",
            hasArtifact: false,
          },
        ],
      },
    ]);

    // When
    const hub = await loadStockResearchHub(
      StockSymbolSchema.parse(" nvda "),
      STOCK_HUB_NOW,
    );

    // Then
    expect(hub).toEqual({
      symbol: "NVDA",
      company: "NVIDIA Corporation",
      latestPublishedAt: "2026-08-03T00:00:00.000Z",
      reports: [
        {
          reportId: stockHubFixtureId("20000000", 1),
          question: "How durable is data-center demand?",
          locale: "en",
          researchTarget: { kind: "committee" },
          publishedAt: "2026-08-03T00:00:00.000Z",
          status: "complete_with_limitations",
        },
        {
          reportId: stockHubFixtureId("20000000", 2),
          question: "마진의 핵심 변수를 분석해줘",
          locale: "ko",
          researchTarget: {
            kind: "department",
            departmentId: "financial",
          },
          publishedAt: "2026-08-02T00:00:00.000Z",
          status: "complete",
        },
      ],
    });
  });

  it("returns no hub when a symbol has no mature public report", async () => {
    // Given
    await createStockHubFixture([
      {
        reportId: stockHubFixtureId("20000000", 6),
        symbol: "AAPL",
        company: "Apple Inc.",
        question: "Recent report",
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
    const hub = await loadStockResearchHub(
      StockSymbolSchema.parse("AAPL"),
      STOCK_HUB_NOW,
    );

    // Then
    expect(hub).toBeUndefined();
  });
});

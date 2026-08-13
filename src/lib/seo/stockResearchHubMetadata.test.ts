import { describe, expect, it } from "vitest";
import { StockSymbolSchema } from "../../research/server/researchRoom/researchRoomPublicCatalog";
import type { StockResearchHub } from "../../research/server/researchRoom/stockResearchHubCatalog";
import {
  stockResearchHubMetadata,
  unavailableStockResearchHubMetadata,
} from "./stockResearchHubMetadata";

const hub = {
  symbol: StockSymbolSchema.parse("NVDA"),
  company: "NVIDIA Corporation",
  latestPublishedAt: "2026-08-03T00:00:00.000Z",
  reports: [],
} satisfies StockResearchHub;

describe("stock research hub metadata", () => {
  it("publishes Korean canonical and reciprocal language URLs", () => {
    // Given
    // When
    const metadata = stockResearchHubMetadata("ko", hub);

    // Then
    expect(metadata).toEqual(
      expect.objectContaining({
        title: {
          absolute: "NVIDIA Corporation(NVDA) 미국주식 분석 | Stocksembly",
        },
        robots: { index: true, follow: true },
        alternates: {
          canonical: "/ko/stocks/nvda",
          languages: {
            "ko-KR": "/ko/stocks/nvda",
            "en-US": "/en/stocks/nvda",
            "x-default": "/en/stocks/nvda",
          },
        },
      }),
    );
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({
        url: "/ko/stocks/nvda",
        locale: "ko_KR",
      }),
    );
  });

  it("publishes an English stock-analysis title on the English URL", () => {
    // Given
    // When
    const metadata = stockResearchHubMetadata("en", hub);

    // Then
    expect(metadata).toEqual(
      expect.objectContaining({
        title: {
          absolute: "NVIDIA Corporation (NVDA) Stock Analysis | Stocksembly",
        },
        alternates: expect.objectContaining({
          canonical: "/en/stocks/nvda",
        }),
      }),
    );
  });

  it("marks invalid or unavailable hubs as non-indexable", () => {
    // Given
    // When
    const metadata = unavailableStockResearchHubMetadata("ko");

    // Then
    expect(metadata).toEqual({
      title: { absolute: "미국주식 분석 | Stocksembly" },
      robots: { index: false, follow: false },
    });
  });
});

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockSymbolSchema } from "@/src/research/server/researchRoom/researchRoomPublicCatalog";
import type { StockResearchHub } from "@/src/research/server/researchRoom/stockResearchHubCatalog";
import KoreanStockResearchHubPage, { generateMetadata } from "./page";

const routeState = vi.hoisted(() => ({
  getStockResearchHubPageData: vi.fn(),
}));

vi.mock("@/src/research/server/researchRoom/stockResearchHubPageData", () => ({
  getStockResearchHubPageData: routeState.getStockResearchHubPageData,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/src/components/seo/StockResearchHubPage", () => ({
  StockResearchHubPage: ({
    hub,
    locale,
  }: {
    readonly hub: StockResearchHub;
    readonly locale: "ko" | "en";
  }) => <main>{`${locale}:${hub.symbol}`}</main>,
}));

const hub = {
  symbol: StockSymbolSchema.parse("NVDA"),
  company: "NVIDIA Corporation",
  latestPublishedAt: "2026-08-03T00:00:00.000Z",
  reports: [],
} satisfies StockResearchHub;

function props(symbol: string) {
  return { params: Promise.resolve({ symbol }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Korean stock research hub route", () => {
  it("publishes indexable metadata only for an eligible hub", async () => {
    // Given
    routeState.getStockResearchHubPageData.mockResolvedValueOnce(hub);

    // When
    const metadata = await generateMetadata(props("nvda"));

    // Then
    expect(metadata).toEqual(
      expect.objectContaining({
        robots: { index: true, follow: true },
        alternates: expect.objectContaining({
          canonical: "/ko/stocks/nvda",
        }),
      }),
    );
  });

  it("returns a 404 and noindex metadata when no mature report exists", async () => {
    // Given
    routeState.getStockResearchHubPageData.mockResolvedValue(undefined);

    // When
    const metadata = await generateMetadata(props("aapl"));
    const page = KoreanStockResearchHubPage(props("aapl"));

    // Then
    expect(metadata.robots).toEqual({ index: false, follow: false });
    await expect(page).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the localized hub for an eligible symbol", async () => {
    // Given
    routeState.getStockResearchHubPageData.mockResolvedValueOnce(hub);

    // When
    const element = await KoreanStockResearchHubPage(props("NVDA"));
    const page = render(element);

    // Then
    expect(page.getByRole("main")).toHaveTextContent("ko:NVDA");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockSymbolSchema } from "./researchRoomPublicCatalog";
import { getStockResearchHubPageData } from "./stockResearchHubPageData";

const pageDataState = vi.hoisted(() => ({
  loadStockResearchHub: vi.fn(),
}));

vi.mock("./stockResearchHubCatalog", () => ({
  loadStockResearchHub: pageDataState.loadStockResearchHub,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

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

import { cache } from "react";
import { StockSymbolSchema } from "./researchRoomPublicCatalog";
import {
  loadStockResearchHub,
  type StockResearchHub,
} from "./stockResearchHubCatalog";

async function loadPageData(
  rawSymbol: string,
): Promise<StockResearchHub | undefined> {
  const symbol = StockSymbolSchema.safeParse(rawSymbol);
  return symbol.success ? await loadStockResearchHub(symbol.data) : undefined;
}

export const getStockResearchHubPageData = cache(loadPageData);

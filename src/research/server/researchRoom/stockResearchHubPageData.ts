import { cache } from "react";
import { loadResearchRoomReport } from "./researchRoomCatalog";
import { isResearchRoomIndexable } from "./researchRoomIndexability";
import { StockSymbolSchema } from "./researchRoomPublicCatalog";
import {
  loadStockResearchHub,
  type StockResearchHub,
  type StockResearchHubReport,
} from "./stockResearchHubCatalog";

const loadSummary = async (
  report: StockResearchHubReport,
  now: Date,
): Promise<StockResearchHubReport["summary"]> => {
  if (!isResearchRoomIndexable(report.status, report.publishedAt, now))
    return undefined;
  try {
    const bundle = await loadResearchRoomReport(
      report.reportId,
      { authenticated: false, tier: "free" },
      now,
    );
    if (
      bundle === undefined ||
      bundle === "locked" ||
      bundle.item.locked ||
      bundle.item.reportId !== report.reportId ||
      bundle.item.publishedAt !== report.publishedAt ||
      !isResearchRoomIndexable(bundle.item.status, bundle.item.publishedAt, now)
    )
      return undefined;
    const locale = bundle.item.locale;
    const thesis = bundle.file.thesis[locale].trim();
    if (thesis.length === 0) return undefined;
    const characters = Array.from(thesis);
    const text =
      characters.length > 420
        ? `${characters.slice(0, 419).join("").trimEnd()}…`
        : thesis;
    const sources = bundle.file.evidenceIndex
      .flatMap((source) => {
        if (source.url === undefined) return [];
        try {
          const url = new URL(source.url);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username !== "" ||
            url.password !== ""
          )
            return [];
          return [
            { title: source.title.trim() || url.hostname, url: url.href },
          ];
        } catch {
          return [];
        }
      })
      .filter(
        (source, index, sources) =>
          sources.findIndex((candidate) => candidate.url === source.url) ===
          index,
      )
      .slice(0, 3);
    return { text, locale, sources };
  } catch {
    // An unavailable optional artifact must not hide the public archive.
    return undefined;
  }
};

const loadPageData = async (
  rawSymbol: string,
): Promise<StockResearchHub | undefined> => {
  const symbol = StockSymbolSchema.safeParse(rawSymbol);
  if (!symbol.success) return undefined;
  const hub = await loadStockResearchHub(symbol.data);
  const latest = hub?.reports[0];
  if (hub === undefined || latest === undefined) return hub;
  const summary = await loadSummary(latest, new Date());
  if (summary === undefined) return hub;
  return { ...hub, reports: [{ ...latest, summary }, ...hub.reports.slice(1)] };
};

export const getStockResearchHubPageData = cache(loadPageData);

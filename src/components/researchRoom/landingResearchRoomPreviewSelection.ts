import type { ResearchRoomCatalogItem } from "../../research/server/researchRoom/researchRoomCatalog";

export type LandingResearchRoomPreviewData = {
  readonly reports: readonly ResearchRoomCatalogItem[];
  readonly companyNames: Readonly<Record<string, string>>;
};

export const LANDING_COMPANY_NAME_FALLBACKS: Readonly<Record<string, string>> =
  {
    AAPL: "Apple Inc.",
    AMZN: "Amazon.com, Inc.",
    MSFT: "Microsoft Corporation",
    MU: "Micron Technology, Inc.",
    NVDA: "NVIDIA Corporation",
    TSLA: "Tesla, Inc.",
  };

export const EMPTY_LANDING_RESEARCH_ROOM_PREVIEW: LandingResearchRoomPreviewData =
  { reports: [], companyNames: LANDING_COMPANY_NAME_FALLBACKS };

// Picks up to five cards for the landing deck: one report per symbol first,
// then the newest remaining reports, and always at least one open report
// when the catalog has any.
export function selectLandingResearchRoomPreview(
  reports: readonly ResearchRoomCatalogItem[],
): readonly ResearchRoomCatalogItem[] {
  const selected: ResearchRoomCatalogItem[] = [];
  const symbols = new Set<string>();
  for (const report of reports) {
    if (symbols.has(report.symbol)) continue;
    selected.push(report);
    symbols.add(report.symbol);
    if (selected.length === 5) break;
  }
  for (const report of reports) {
    if (selected.length === 5) break;
    if (selected.some((item) => item.reportId === report.reportId)) continue;
    selected.push(report);
  }
  const firstOpen = reports.find((report) => !report.locked);
  if (
    firstOpen !== undefined &&
    selected.every((report) => report.locked) &&
    !selected.some((report) => report.reportId === firstOpen.reportId)
  ) {
    selected.splice(Math.min(4, selected.length), 1, firstOpen);
  }
  return selected.slice(0, 5);
}

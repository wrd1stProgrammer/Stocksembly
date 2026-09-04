import {
  EMPTY_LANDING_RESEARCH_ROOM_PREVIEW,
  LANDING_COMPANY_NAME_FALLBACKS,
  type LandingResearchRoomPreviewData,
  selectLandingResearchRoomPreview,
} from "@/src/components/researchRoom/landingResearchRoomPreviewSelection";
import type { AppLocale } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import { getLiveTickerCatalog } from "@/src/research/server/api/liveTickerCatalog";
import { listResearchRoomReportPage } from "@/src/research/server/researchRoom/researchRoomCatalog";
import { requestFromPage } from "./pageRequest";

async function lookupCompanyNames(
  symbols: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  if (symbols.length === 0) return {};
  const catalog = await getLiveTickerCatalog();
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const match = (await catalog.search(symbol)).find(
          (ticker) => ticker.symbol === symbol,
        );
        return match === undefined
          ? undefined
          : ([symbol, match.company] as const);
      } catch {
        return undefined;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
}

// Loads the landing deck on the server so the page arrives with its cards
// instead of fetching them after hydration. Any failure hides the deck, which
// is what the client did when its fetch failed.
export async function loadLandingResearchRoomPreview(
  locale: AppLocale,
): Promise<LandingResearchRoomPreviewData> {
  try {
    const api = await getLiveResearchApi();
    const access = await api.researchRoomAccess(await requestFromPage("/"));
    const page = await listResearchRoomReportPage(access, {
      limit: 5,
      offset: 0,
      scope: "all",
      sort: "latest",
      locale,
    });
    const reports = selectLandingResearchRoomPreview(page.reports);
    const companyNames = {
      ...LANDING_COMPANY_NAME_FALLBACKS,
      ...(await lookupCompanyNames([
        ...new Set(reports.map((report) => report.symbol)),
      ])),
    };
    return { reports, companyNames };
  } catch {
    return EMPTY_LANDING_RESEARCH_ROOM_PREVIEW;
  }
}

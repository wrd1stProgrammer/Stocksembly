import {
  EMPTY_LANDING_RESEARCH_ROOM_PREVIEW,
  LANDING_COMPANY_NAME_FALLBACKS,
  type LandingResearchRoomPreviewData,
  selectLandingResearchRoomPreview,
} from "@/src/components/researchRoom/landingResearchRoomPreviewSelection";
import type { AppLocale } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import { getLiveTickerCatalog } from "@/src/research/server/api/liveTickerCatalog";
import { createPublicMetadataCache } from "@/src/research/server/researchRoom/publicMetadataCache";
import {
  listLandingResearchRoomReports,
  type ResearchRoomAccess,
} from "@/src/research/server/researchRoom/researchRoomCatalog";
import { isResearchRoomPublicationMature } from "@/src/research/server/researchRoom/researchRoomIndexability";
import { requestFromPage } from "./pageRequest";

async function lookupCompanyNames(
  symbols: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  if (symbols.length === 0) return {};
  const catalog = await getLiveTickerCatalog();
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const match = await catalog.lookup(symbol);
        return match.kind === "resolved"
          ? ([symbol, match.symbol.company] as const)
          : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== undefined));
}

const publicPreview = createPublicMetadataCache(async (locale: AppLocale) => {
  const reports = selectLandingResearchRoomPreview(
    await listLandingResearchRoomReports(locale),
  );
  const companyNames = {
    ...LANDING_COMPANY_NAME_FALLBACKS,
    ...(await lookupCompanyNames([
      ...new Set(reports.map((report) => report.symbol)),
    ])),
  };
  return { reports, companyNames };
}, 30_000);

// Loads the landing deck on the server so the page arrives with its cards
// instead of fetching them after hydration. Any failure hides the deck, which
// is what the client did when its fetch failed.
export async function loadLandingResearchRoomPreview(
  locale: AppLocale,
  initialAccess?: ResearchRoomAccess,
): Promise<LandingResearchRoomPreviewData> {
  try {
    const access =
      initialAccess ??
      (await (
        await getLiveResearchApi()
      ).researchRoomAccess(await requestFromPage("/")));
    const preview = await publicPreview(locale);
    const now = new Date();
    return {
      ...preview,
      reports: preview.reports.map((report) => ({
        ...report,
        locked:
          !access.authenticated &&
          !isResearchRoomPublicationMature(report.publishedAt, now),
      })),
    };
  } catch {
    return EMPTY_LANDING_RESEARCH_ROOM_PREVIEW;
  }
}

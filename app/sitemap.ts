import type { MetadataRoute } from "next";
import { editorialDefinitions, editorialPath } from "@/src/editorial/catalog";
import { locales } from "@/src/lib/i18n";
import { listResearchRoomSitemapEntries } from "@/src/research/server/researchRoom/researchRoomCatalog";
import {
  listStockResearchHubSitemapEntries,
  type StockResearchHubSitemapEntry,
} from "@/src/research/server/researchRoom/stockResearchHubCatalog";

const BASE_URL = "https://stocksembly.com";
const SEARCH_LANDING_PAGES = locales.map((locale) => ({
  path: `${locale}/us-stock-analysis`,
  priority: 0.8,
}));
const PUBLIC_INFORMATION_PAGES = [
  { path: "about", priority: 0.6 },
  { path: "methodology", priority: 0.7 },
  { path: "editorial-policy", priority: 0.6 },
  { path: "corrections", priority: 0.5 },
  { path: "contact", priority: 0.5 },
] as const;

export const dynamic = "force-dynamic";

function staticSitemapEntries(): MetadataRoute.Sitemap {
  return [
    ...locales.map((locale) => ({
      url: `${BASE_URL}/${locale}`,
      changeFrequency: "weekly" as const,
      priority: locale === "en" ? 1 : 0.9,
    })),
    {
      url: `${BASE_URL}/research-room`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...SEARCH_LANDING_PAGES.map((page) => ({
      url: `${BASE_URL}/${page.path}`,
      changeFrequency: "weekly" as const,
      priority: page.priority,
    })),
    ...locales.flatMap((locale) => [
      {
        url: `${BASE_URL}${editorialPath(locale, "blog")}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      },
      {
        url: `${BASE_URL}${editorialPath(locale, "glossary")}`,
        changeFrequency: "monthly" as const,
        priority: 0.65,
      },
      ...editorialDefinitions.map((entry) => ({
        url: `${BASE_URL}${editorialPath(locale, entry.kind, entry.slug)}`,
        lastModified: entry.modifiedAt,
        changeFrequency: "monthly" as const,
        priority: entry.kind === "blog" ? 0.65 : 0.6,
      })),
    ]),
    ...PUBLIC_INFORMATION_PAGES.map((page) => ({
      url: `${BASE_URL}/${page.path}`,
      changeFrequency: "monthly" as const,
      priority: page.priority,
    })),
    ...["terms", "privacy", "disclaimer", "risk-disclosure"].map((path) => ({
      url: `${BASE_URL}/${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = staticSitemapEntries();
  try {
    const reportEntries = await listResearchRoomSitemapEntries();
    let hubEntries: readonly StockResearchHubSitemapEntry[] = [];
    try {
      hubEntries = await listStockResearchHubSitemapEntries();
    } catch (error) {
      // no-excuse-ok: catch
      console.error(
        "[sitemap] failed to load stock research hub entries",
        error,
      );
    }
    return [
      ...staticEntries,
      ...reportEntries.map((entry) => ({
        url: `${BASE_URL}/research-room/${entry.reportId}`,
        lastModified: entry.publishedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...hubEntries.flatMap(({ symbol, lastModified }) =>
        locales.map((locale) => ({
          url: `${BASE_URL}/${locale}/stocks/${symbol.toLowerCase()}`,
          lastModified,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        })),
      ),
    ];
  } catch (error) {
    // no-excuse-ok: catch
    console.error("[sitemap] failed to load research room entries", error);
    return staticEntries;
  }
}

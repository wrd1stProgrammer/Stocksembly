import type { MetadataRoute } from "next";
import { listResearchRoomSitemapEntries } from "@/src/research/server/researchRoom/researchRoomCatalog";

const BASE_URL = "https://stocksembly.com";
const PUBLIC_INFORMATION_PAGES = [
  { path: "about", priority: 0.6 },
  { path: "methodology", priority: 0.7 },
  { path: "editorial-policy", priority: 0.6 },
  { path: "corrections", priority: 0.5 },
] as const;

export const dynamic = "force-dynamic";

function staticSitemapEntries(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/research-room`,
      changeFrequency: "daily",
      priority: 0.9,
    },
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
    return [
      ...staticEntries,
      ...reportEntries.map((entry) => ({
        url: `${BASE_URL}/research-room/${entry.reportId}`,
        lastModified: entry.publishedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch (error) {
    // no-excuse-ok: catch
    console.error("[sitemap] failed to load research room entries", error);
    return staticEntries;
  }
}

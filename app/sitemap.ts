import type { MetadataRoute } from "next";
import { listResearchRoomSitemapEntries } from "@/src/research/server/researchRoom/researchRoomCatalog";

const BASE_URL = "https://stocksembly.com";

export const dynamic = "force-dynamic";

function staticSitemapEntries(updatedAt: Date): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: updatedAt,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/research-room`,
      lastModified: updatedAt,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...[
      "terms",
      "privacy",
      "disclaimer",
      "risk-disclosure",
      "login",
      "signup",
    ].map((path) => ({
      url: `${BASE_URL}/${path}`,
      lastModified: updatedAt,
      changeFrequency: "monthly" as const,
      priority: path === "login" || path === "signup" ? 0.4 : 0.3,
    })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const updatedAt = new Date();
  const staticEntries = staticSitemapEntries(updatedAt);
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

import type { MetadataRoute } from "next";

const BASE_URL = "https://stocksembly.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const updatedAt = new Date();
  return [
    {
      url: BASE_URL,
      lastModified: updatedAt,
      changeFrequency: "weekly",
      priority: 1,
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

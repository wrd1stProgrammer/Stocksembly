import { z } from "zod";

export const aggregateSchema = z
  .object({
    kind: z.enum(["pageview", "engagement"]),
    surface: z.enum(["landing", "pricing", "blog", "glossary", "legal"]),
    source: z.enum([
      "meta",
      "instagram",
      "facebook",
      "tiktok",
      "threads",
      "google",
      "linkedin",
      "direct",
      "other",
    ]),
    device: z.enum(["small_screen", "large_screen"]),
    visibleSeconds: z.number().int().min(0).max(1800),
    scrollDepth: z.union([
      z.literal(0),
      z.literal(25),
      z.literal(50),
      z.literal(75),
      z.literal(100),
    ]),
  })
  .strict();

export type AggregateVisit = z.infer<typeof aggregateSchema>;

export function publicSurface(
  path: string,
): AggregateVisit["surface"] | undefined {
  const p =
    path.replace(/^\/(en|ko|ja|zh-TW|es|pt-BR|de|fr)(?=\/|$)/, "") || "/";
  if (p === "/") return "landing";
  if (p === "/pricing") return "pricing";
  if (/^\/blog(?:\/|$)/.test(p)) return "blog";
  if (/^\/glossary(?:\/|$)/.test(p)) return "glossary";
  if (["/privacy", "/terms", "/refund"].includes(p)) return "legal";
  return undefined;
}

export function aggregateSource(search: string): AggregateVisit["source"] {
  const source = new URLSearchParams(search).get("utm_source")?.toLowerCase();
  if (!source) return "direct";
  if (source === "fb") return "facebook";
  if (source === "ig") return "instagram";
  const parsed = aggregateSchema.shape.source.safeParse(source);
  return parsed.success ? parsed.data : "other";
}

export function allowsAggregate(
  cookie: string,
  gpc: boolean,
  dnt: string | null,
): boolean {
  return (
    !gpc &&
    dnt !== "1" &&
    !cookie
      .split(";")
      .some((part) =>
        /^stocksembly_analytics_consent=(denied|granted)$/.test(part.trim()),
      )
  );
}

import { z } from "zod";
export const productEngagementSchema = z
  .object({
    eventId: z.string().uuid(),
    sessionId: z.string().uuid(),
    surface: z.enum([
      "landing",
      "research",
      "reports",
      "briefing",
      "account",
      "blog",
      "glossary",
      "other",
    ]),
    kind: z.enum([
      "page",
      "interests_saved",
      "onboarding_completed",
      "plans_opened",
    ]),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    visibleMs: z.number().int().min(0).max(86_400_000),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.endedAt) >= Date.parse(v.startedAt) &&
      v.visibleMs <= Date.parse(v.endedAt) - Date.parse(v.startedAt) + 1000,
  );
export type ProductEngagement = z.infer<typeof productEngagementSchema>;
export function engagementSurface(path: string): ProductEngagement["surface"] {
  const p =
    path.replace(/^\/(en|ko|ja|zh-TW|es|pt-BR|de|fr)(?=\/|$)/, "") || "/";
  if (p === "/") return "landing";
  if (p.startsWith("/research-room")) return "reports";
  if (p.startsWith("/research/")) return "research";
  if (p.startsWith("/briefing")) return "briefing";
  if (/^\/(account|mypage|profile)/.test(p)) return "account";
  if (p.startsWith("/blog")) return "blog";
  if (p.startsWith("/glossary")) return "glossary";
  return "other";
}

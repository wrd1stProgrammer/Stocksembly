import { z } from "zod";
import { PublicRunDetailSchema } from "../../research/client/schemas";
import type { ResearchFileData } from "../../research/compositions/types";

const text = z.object({ en: z.string(), ko: z.string() });
export const ResearchDemoSchema = z.object({
  reportId: z.string().uuid(),
  symbol: z.string(),
  publishedAt: z.string().datetime(),
  sourceLocale: z.enum(["en", "ko"]),
  question: z.string(),
  sourceUrl: z.string().url(),
  company: z.object({
    symbol: z.string(),
    company: z.string(),
    exchange: z.string(),
    sector: z.string(),
    price: z.string(),
    change: z.string(),
    marketStatus: text,
  }),
  runDetail: PublicRunDetailSchema,
  backdrop: z.object({
    posture: z.enum(["positive", "neutral", "caution"]),
    postureLabel: text,
    evidenceScore: z.object({ passed: z.number(), denominator: z.number() }),
    thesis: text,
    sections: z
      .array(z.object({ title: text, summary: text, detail: text }))
      .max(3),
    sourceCount: z.number(),
    claimCount: z.number(),
  }),
});
export type ResearchDemo = z.infer<typeof ResearchDemoSchema>;

export function demoReportFile(demo: ResearchDemo): ResearchFileData {
  const empty = { en: "", ko: "" };
  return {
    researchTarget: { kind: "committee" },
    evidenceIndex: [],
    coverage: [],
    teamViews: [],
    posture: demo.backdrop.posture,
    postureLabel: demo.backdrop.postureLabel,
    limitationNote: empty,
    evidenceScore: demo.backdrop.evidenceScore,
    sourceCount: demo.backdrop.sourceCount,
    claimCount: demo.backdrop.claimCount,
    asOf: { en: demo.publishedAt, ko: demo.publishedAt },
    freshness: empty,
    condition: empty,
    expectation: empty,
    valuation: empty,
    nextEvent: empty,
    thesis: demo.backdrop.thesis,
    changeCondition: empty,
    positives: [],
    concerns: [],
    analysis: demo.backdrop.sections,
    scenarios: [],
    appendix: [],
    versions: [],
  };
}

export function isRecentDemo(publishedAt: string, now = new Date()) {
  const age = now.getTime() - Date.parse(publishedAt);
  return age >= 0 && age <= 30 * 24 * 60 * 60 * 1000;
}

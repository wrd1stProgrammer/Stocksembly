import { z } from "zod";

export const PUBLICATION_STATUSES = [
  "complete",
  "complete_with_limitations",
  "incomplete",
] as const;
export const PublicationStatusSchema = z.enum(PUBLICATION_STATUSES);
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>;

const forbiddenStandaloneMarketLabel = /\b(?:BUY|SELL|HOLD|OHLCV)\b/;
const forbiddenMarketContent =
  /(?:target|entry|stop|implied)\s+price|consensus\s+(?:target|recommendation)|(?:price|quote|entry|stop|target|position(?:\s+size)?)\s*(?:is|=|:|at)?\s*[$€£₩]?\d/i;
const replaceableMarketContent =
  /(?:target|entry|stop|implied)\s+price(?:\s*[$€£₩]?\d+(?:[,.]\d+)*)?|consensus\s+(?:target|recommendation)|(?:price|quote|entry|stop|target|position(?:\s+size)?)\s*(?:is|=|:|at)?\s*[$€£₩]?\d+(?:[,.]\d+)*(?:\s*%)?/gi;
export const ReportNarrativeTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_000)
  .refine(
    (value) =>
      !forbiddenStandaloneMarketLabel.test(value) &&
      !forbiddenMarketContent.test(value),
    {
      message: "guessed market data or recommendation is forbidden",
    },
  );

export function normalizeReportNarrativeText(
  value: string,
  fallback: string,
): string {
  const normalized = value
    .replace(/\b(?:BUY|SELL|HOLD|OHLCV)\b/g, "market assessment")
    .replace(replaceableMarketContent, "cited market level")
    .replace(/\s+/g, " ")
    .trim();
  return ReportNarrativeTextSchema.safeParse(normalized).success
    ? normalized
    : fallback;
}

export const LocalizedTextSchema = z
  .object({ en: ReportNarrativeTextSchema, ko: ReportNarrativeTextSchema })
  .strict();

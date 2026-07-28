import { z } from "zod";

const FactsEvidenceSchema = z.object({
  value: z.object({
    selectedFacts: z.array(
      z.object({
        metric: z.string(),
        value: z.string(),
        end: z.iso.date(),
        filedAt: z.iso.datetime({ offset: true }),
        periodKind: z.string(),
      }),
    ),
  }),
});

export function latestAnnualRevenueValue(content: string): string | undefined {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    return undefined;
  }
  const parsed = FactsEvidenceSchema.safeParse(parsedJson);
  if (!parsed.success) return undefined;
  return parsed.data.value.selectedFacts
    .filter(
      (fact) =>
        fact.metric === "revenue" &&
        fact.periodKind === "annual" &&
        /^-?\d+(?:\.\d+)?$/.test(fact.value),
    )
    .sort(
      (left, right) =>
        right.end.localeCompare(left.end) ||
        right.filedAt.localeCompare(left.filedAt),
    )[0]?.value;
}

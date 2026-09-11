import { z } from "zod";

const IndicatorSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  period: z.string().optional(),
  value: z.number().finite(),
});
const FundamentalsSchema = z.object({ indicators: z.array(z.unknown()) });
export function evidenceIndicators(value: unknown) {
  const parsed = FundamentalsSchema.safeParse(value);
  return parsed.success
    ? parsed.data.indicators.flatMap((item) => {
        const point = IndicatorSchema.safeParse(item);
        return point.success ? [point.data] : [];
      })
    : [];
}

/** Extract from authenticated source bytes before excerpt truncation. */
export function structuredTeamEvidence(text: string): string | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const indicators = evidenceIndicators(value);
  if (indicators.length)
    return JSON.stringify({
      definition:
        "provider_reported; consolidated unless explicitly specified; FQ is latest reported quarter, not FY; TTM is trailing twelve months; NTM is an estimate",
      indicators: indicators.slice(0, 80),
    });
  const comparisons = z
    .object({
      methodology: z.string(),
      comparisons: z
        .array(
          z.object({
            symbol: z.string(),
            kind: z.string(),
            windows: z
              .array(
                z.object({
                  sessions: z.number(),
                  start: z.string(),
                  end: z.string(),
                  subjectReturnPercent: z.number(),
                  comparatorReturnPercent: z.number(),
                  excessPercentagePoints: z.number(),
                }),
              )
              .max(3),
          }),
        )
        .max(4),
    })
    .safeParse(value);
  return comparisons.success ? JSON.stringify(comparisons.data) : undefined;
}

export function repairQuarterFlowLabel<
  T extends {
    readonly publicSummary: { readonly en: string; readonly ko: string };
    readonly evidenceArtifactIds: readonly string[];
    readonly decisiveMetricIds?: readonly string[] | undefined;
  },
>(position: T, fundamentals: unknown, sourceId: string | undefined): T {
  if (!sourceId || !position.evidenceArtifactIds.includes(sourceId))
    return position;
  const ids = position.decisiveMetricIds ?? [];
  if (!ids.length) return position;
  const points = evidenceIndicators(fundamentals);
  const selected = ids.map((id) =>
    points.find((point) => id.includes(`.${point.id}.`)),
  );
  if (
    selected.some(
      (point) =>
        !point ||
        point.period !== "FQ" ||
        !/^(cash_f_operating_activities|capital_expenditures|free_cash_flow)_fq$/u.test(
          point.id,
        ),
    )
  )
    return position;
  // Only a leading annual flow label is repaired; mixed claims and dates are untouched.
  const en = position.publicSummary.en.replace(
    /^(?:In\s+)?FY\s*20\d{2}(?:\s+|\s*[:,]\s*)(?=(?:operating cash flow|cash from operating|capital expenditures|free cash flow)\b)/iu,
    "In the latest reported quarter (FQ), ",
  );
  const ko = position.publicSummary.ko.replace(
    /^FY\s*20\d{2}(?:년)?\s+(?=(?:영업현금흐름|영업활동현금흐름|자본적지출|잉여현금흐름))/u,
    "최근 보고 분기(FQ) ",
  );
  return en === position.publicSummary.en && ko === position.publicSummary.ko
    ? position
    : { ...position, publicSummary: { en, ko } };
}

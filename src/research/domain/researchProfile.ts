import { z } from "zod";
import { TickerSymbolSchema } from "./ids";

export const INVESTMENT_HORIZONS = ["short", "medium", "long"] as const;
export const COUNTERARGUMENT_INTENSITIES = ["standard", "strong"] as const;
export const ANALYSIS_DEPTHS = ["core", "standard", "deep"] as const;
export const DECISION_PURPOSES = [
  "new_entry",
  "holding_review",
  "position_sizing",
  "earnings",
] as const;

export const ResearchProfileSchema = z
  .object({
    investmentHorizon: z.enum(INVESTMENT_HORIZONS),
    counterargumentIntensity: z.enum(COUNTERARGUMENT_INTENSITIES),
    analysisDepth: z.enum(ANALYSIS_DEPTHS),
    decisionPurpose: z.enum(DECISION_PURPOSES),
    comparisonSymbols: z
      .array(TickerSymbolSchema)
      .max(5)
      .refine(
        (symbols) => new Set(symbols).size === symbols.length,
        "comparison symbols must be unique",
      )
      .readonly(),
  })
  .strict()
  .readonly();

export type ResearchProfile = z.infer<typeof ResearchProfileSchema>;

export const DEFAULT_RESEARCH_PROFILE: ResearchProfile = Object.freeze({
  investmentHorizon: "medium",
  counterargumentIntensity: "standard",
  analysisDepth: "standard",
  decisionPurpose: "new_entry",
  comparisonSymbols: Object.freeze([]),
});

export function normalizeResearchProfile(
  input: unknown,
  subjectSymbol?: string,
): ResearchProfile {
  const parsed = ResearchProfileSchema.parse(input ?? DEFAULT_RESEARCH_PROFILE);
  const subject = subjectSymbol?.trim().toUpperCase();
  return ResearchProfileSchema.parse({
    ...parsed,
    comparisonSymbols: [
      ...new Set(
        parsed.comparisonSymbols
          .map((symbol) => symbol.toUpperCase())
          .filter((symbol) => symbol !== subject),
      ),
    ].slice(0, 5),
  });
}

export function researchProfileFromQuery(input: {
  readonly horizon?: string;
  readonly counter?: string;
  readonly depth?: string;
  readonly purpose?: string;
  readonly peers?: string;
}): ResearchProfile {
  const peers = (input.peers ?? "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => TickerSymbolSchema.safeParse(symbol).success)
    .slice(0, 5);
  const parsed = ResearchProfileSchema.safeParse({
    investmentHorizon: input.horizon,
    counterargumentIntensity: input.counter,
    analysisDepth: input.depth,
    decisionPurpose: input.purpose,
    comparisonSymbols: peers,
  });
  return parsed.success ? parsed.data : DEFAULT_RESEARCH_PROFILE;
}

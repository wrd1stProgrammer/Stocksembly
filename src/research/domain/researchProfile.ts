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

const QUESTION_SYMBOL_ALIASES: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    NVDA: Object.freeze([
      "NVIDIA",
      "엔비디아",
      "앤비디아",
      "앤디비아",
      "엔디비아",
    ]),
    AMD: Object.freeze(["AMD", "Advanced Micro Devices", "암드"]),
    AAPL: Object.freeze(["AAPL", "Apple", "애플"]),
    MSFT: Object.freeze(["MSFT", "Microsoft", "마이크로소프트"]),
    AMZN: Object.freeze(["AMZN", "Amazon", "아마존"]),
    TSLA: Object.freeze(["TSLA", "Tesla", "테슬라"]),
    GOOGL: Object.freeze(["GOOGL", "Alphabet", "Google", "알파벳", "구글"]),
    META: Object.freeze(["META", "Meta Platforms", "메타"]),
    AVGO: Object.freeze(["AVGO", "Broadcom", "브로드컴"]),
    INTC: Object.freeze(["INTC", "Intel", "인텔"]),
    QCOM: Object.freeze(["QCOM", "Qualcomm", "퀄컴"]),
  });

function mentionsAlias(question: string, alias: string): boolean {
  if (/^[A-Za-z0-9 .-]+$/.test(alias)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?:^|[^A-Za-z0-9])${escaped}(?:$|[^A-Za-z0-9])`,
      "iu",
    ).test(question);
  }
  return question.includes(alias);
}

/**
 * Recovers explicitly named comparison companies from natural-language
 * questions. This is intentionally deterministic: it never invents a peer,
 * and merely prevents a named company from being dropped when the user did
 * not also fill the optional comparison-symbol control.
 */
export function inferQuestionComparisonSymbols(
  question: string,
  subjectSymbol: string,
): readonly string[] {
  const subject = subjectSymbol.trim().toUpperCase();
  return Object.entries(QUESTION_SYMBOL_ALIASES)
    .filter(
      ([symbol, aliases]) =>
        symbol !== subject &&
        aliases.some((alias) => mentionsAlias(question, alias)),
    )
    .map(([symbol]) => symbol)
    .slice(0, 5);
}

export function withQuestionComparisonSymbols(
  profile: ResearchProfile,
  question: string,
  subjectSymbol: string,
): ResearchProfile {
  return ResearchProfileSchema.parse({
    ...profile,
    comparisonSymbols: [
      ...new Set([
        ...profile.comparisonSymbols,
        ...inferQuestionComparisonSymbols(question, subjectSymbol),
      ]),
    ].slice(0, 5),
  });
}

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

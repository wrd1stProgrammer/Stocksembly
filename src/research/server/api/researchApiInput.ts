import { z } from "zod";
import { TickerSymbolSchema } from "../../domain/ids";
import { normalizeResearchDirection } from "../../domain/researchDirection";
import {
  DEFAULT_RESEARCH_PROFILE,
  normalizeResearchProfile,
  ResearchProfileSchema,
} from "../../domain/researchProfile";
import {
  COMMITTEE_RESEARCH_TARGET,
  ResearchTargetSchema,
} from "../../domain/researchTarget";
import type { NormalizedResearchRequest } from "./researchApiContracts";
import { NormalizedResearchRequestSchema } from "./researchApiContracts";

const RequestBodySchema = z
  .object({
    symbol: z.string().trim().min(1).max(32),
    question: z.string(),
    locale: z.enum(["en", "ko"]),
    researchTarget: ResearchTargetSchema.optional(),
    researchProfile: ResearchProfileSchema.optional(),
  })
  .strict();

export type ResearchInputResult =
  | { readonly kind: "accepted"; readonly request: NormalizedResearchRequest }
  | {
      readonly kind: "request_invalid" | "symbol_invalid" | "question_invalid";
    };

export function parseResearchInput(input: unknown): ResearchInputResult {
  const parsed = RequestBodySchema.safeParse(input);
  if (!parsed.success) return { kind: "request_invalid" };
  const symbol = TickerSymbolSchema.safeParse(parsed.data.symbol);
  if (!symbol.success) return { kind: "symbol_invalid" };
  const question = normalizeResearchDirection(parsed.data.question) ?? "";
  return {
    kind: "accepted",
    request: NormalizedResearchRequestSchema.parse({
      symbol: symbol.data,
      question,
      locale: parsed.data.locale,
      researchTarget: parsed.data.researchTarget ?? COMMITTEE_RESEARCH_TARGET,
      researchProfile: normalizeResearchProfile(
        parsed.data.researchProfile ?? DEFAULT_RESEARCH_PROFILE,
        symbol.data,
      ),
    }),
  };
}

export function parseIdempotencyKey(value: string | null): string | undefined {
  if (value === null || value.length === 0 || value.length > 128)
    return undefined;
  return /^[\x21-\x7e]+$/.test(value) ? value : undefined;
}

import { z } from "zod";
import { EditorialDecisionDimensionSchema } from "./agentOutputsShared";
import type { ResearchProfile } from "./researchProfile";

export const ResearchBriefSchema = z
  .object({
    version: z.literal("research-brief-v1"),
    question: z.string().min(1).max(500),
    objective: z.enum([
      "financial_health",
      "business_quality",
      "valuation",
      "position_review",
      "catalyst",
      "general",
    ]),
    decisionFrame: z.string().min(1).max(700),
    priorityDimensions: z.array(EditorialDecisionDimensionSchema).min(1).max(8),
    entities: z
      .array(
        z
          .object({
            term: z.string().min(1).max(120),
            meaning: z.string().min(1).max(350).nullable(),
            evidenceId: z.string().min(1).nullable(),
            exactQuote: z.string().min(1).max(600).nullable(),
          })
          .strict(),
      )
      .max(6),
    cruxes: z
      .array(
        z
          .object({
            question: z.string().min(1).max(400),
            dimension: EditorialDecisionDimensionSchema,
            evidenceNeeded: z.string().min(1).max(400),
            searchTerms: z.array(z.string().min(1).max(100)).min(1).max(6),
          })
          .strict(),
      )
      .min(3)
      .max(5),
    limitations: z.array(z.string().min(1).max(400)).max(8),
  })
  .strict()
  .readonly();
export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;

export function groundedResearchBrief(
  input: unknown,
  question: string,
  sources: readonly { readonly evidenceId: string; readonly text: string }[],
): ResearchBrief {
  const brief = ResearchBriefSchema.parse(input);
  const entities = brief.entities.map((entity) => {
    const source = sources.find(
      (item) => item.evidenceId === entity.evidenceId,
    );
    const grounded =
      question.toLowerCase().includes(entity.term.toLowerCase()) &&
      entity.meaning !== null &&
      entity.exactQuote !== null &&
      source?.text.includes(entity.exactQuote);
    return grounded
      ? entity
      : {
          term: entity.term,
          meaning: null,
          evidenceId: null,
          exactQuote: null,
        };
  });
  return ResearchBriefSchema.parse({
    ...brief,
    question,
    entities,
    limitations: [
      ...brief.limitations,
      ...entities
        .filter((item) => item.meaning === null)
        .map(
          (item) =>
            `Resolve the exact meaning of '${item.term}' in an issuer primary source before making claims about it.`,
        ),
    ].slice(0, 8),
  });
}

export function fallbackResearchBrief(
  question: string,
  profile: ResearchProfile,
): ResearchBrief {
  const financial =
    /재무|현금.?흐름|건전|부채|financial health|balance sheet|cash conversion|solven/iu.test(
      question,
    );
  const objective = financial
    ? "financial_health"
    : profile.investmentHorizon === "long"
      ? "business_quality"
      : "general";
  const dimensions = financial
    ? (["cash_conversion", "margin", "mitigant"] as const)
    : (["growth_engine", "reinvestment", "embedded_expectations"] as const);
  const questions = financial
    ? [
        "How do the latest earnings convert into cash, and why did conversion change?",
        "Are margins durable across comparable quarters?",
        "Can liquidity and debt maturities withstand the main downside case?",
      ]
    : [
        "What operating mechanism answers the user's question and what has changed?",
        "Does growth create cash after the required reinvestment?",
        "What performance does the current valuation require and what could invalidate it?",
      ];
  return ResearchBriefSchema.parse({
    version: "research-brief-v1",
    question,
    objective,
    decisionFrame: financial
      ? "Assess financial resilience; answer financial strength directly without substituting a buy/sell verdict."
      : `Answer the exact question for a ${profile.investmentHorizon} horizon and ${profile.decisionPurpose} purpose.`,
    priorityDimensions: dimensions,
    entities: [],
    cruxes: dimensions.map((dimension, index) => ({
      question: questions[index],
      dimension,
      evidenceNeeded:
        "Latest issuer filing and comparable fiscal periods; distinguish disclosed facts from assumptions.",
      searchTerms: financial
        ? ["cash flow", "operating margin", "liquidity", "debt maturity"]
        : [
            "segment revenue",
            "capital expenditure",
            "operating margin",
            "outlook",
          ],
    })),
    limitations: [
      "Question planning was unavailable. Resolve every product or event name from primary evidence; do not guess from spelling or substitute a different topic.",
    ],
  });
}

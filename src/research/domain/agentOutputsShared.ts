import { z } from "zod";
import { ArtifactIdSchema, ClaimIdSchema, QuestionIdSchema } from "./ids";

const URL_PATTERN =
  /(?:\b[a-z][a-z0-9+.-]{1,31}:(?:\/\/|[^\s])|(?:^|\s)\/\/[^\s]|\bwww\.)/i;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

export const PublicModelTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .refine(
    (value) => !containsControlCharacter(value),
    "control characters are not public text",
  )
  .refine((value) => !URL_PATTERN.test(value), "URLs are not model payloads");

export const BilingualPublicTextSchema = z
  .object({ en: PublicModelTextSchema, ko: PublicModelTextSchema })
  .strict()
  .readonly();

export const SourceArtifactIdsSchema = z
  .array(ArtifactIdSchema)
  .min(1)
  .max(64)
  .refine(
    (values) => new Set(values).size === values.length,
    "duplicate source",
  )
  .readonly();

export const ClaimIdsSchema = z
  .array(ClaimIdSchema)
  .min(1)
  .max(64)
  .refine((values) => new Set(values).size === values.length, "duplicate claim")
  .readonly();

const RegisteredValueIdSchema = z.string().trim().min(1).max(240);

export const EditorialDecisionDimensionSchema = z.enum([
  "regime",
  "timing",
  "relative_performance",
  "catalyst",
  "growth_engine",
  "adoption",
  "moat",
  "competitive_erosion",
  "margin",
  "cash_conversion",
  "reinvestment",
  "embedded_expectations",
  "downside_path",
  "leading_indicator",
  "mitigant",
]);

export const PublicPositionSchema = z
  .object({
    claimId: ClaimIdSchema,
    decisionDimension: EditorialDecisionDimensionSchema.optional(),
    roleOwner: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/)
      .optional(),
    stance: z.enum(["supports", "opposes", "uncertain"]),
    materiality: z.enum(["material", "supporting"]).optional(),
    publicSummary: BilingualPublicTextSchema,
    evidenceArtifactIds: SourceArtifactIdsSchema,
    decisiveMetricIds: z
      .array(RegisteredValueIdSchema)
      .max(3)
      .readonly()
      .optional(),
    strongestContraryObservation: BilingualPublicTextSchema.optional(),
    falsifier: BilingualPublicTextSchema.optional(),
  })
  .strict()
  .readonly();

export const DissentSchema = z
  .object({
    claimId: ClaimIdSchema,
    publicSummary: BilingualPublicTextSchema,
  })
  .strict()
  .readonly();

export const DissentListSchema = z.array(DissentSchema).max(32).readonly();
export const UnknownListSchema = z
  .array(BilingualPublicTextSchema)
  .max(32)
  .readonly();

const DistinctArtifactIdsSchema = z
  .array(ArtifactIdSchema)
  .max(64)
  .refine(
    (values) => new Set(values).size === values.length,
    "duplicate evidence",
  )
  .readonly();

export const AtomicEditorialClaimSchema = z
  .object({
    claimId: ClaimIdSchema,
    decisionDimension: EditorialDecisionDimensionSchema,
    roleOwner: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    stanceContribution: z.enum(["supports", "opposes", "uncertain"]),
    materiality: z.enum(["material", "supporting"]),
    publicThesis: BilingualPublicTextSchema,
    evidenceArtifactIds: SourceArtifactIdsSchema,
    counterevidenceArtifactIds: DistinctArtifactIdsSchema,
    decisiveMetricIds: z
      .array(RegisteredValueIdSchema)
      .max(3)
      .refine(
        (values) => new Set(values).size === values.length,
        "duplicate decisive metric",
      )
      .readonly(),
    falsifier: BilingualPublicTextSchema,
  })
  .strict()
  .readonly();

export const EditorialStanceSchema = z.enum([
  "upside_skewed",
  "wait_for_proof",
  "downside_skewed",
]);
export const EditorialConfidenceSchema = z.enum(["high", "medium", "low"]);

export const TeamEditorialDecisionSchema = z
  .object({
    stance: EditorialStanceSchema,
    confidence: EditorialConfidenceSchema,
    decisiveReason: BilingualPublicTextSchema,
    strongestCountercase: BilingualPublicTextSchema,
    falsifier: BilingualPublicTextSchema,
    primaryClaimIds: ClaimIdsSchema,
  })
  .strict()
  .readonly();

export const ComparatorSchema = z
  .object({
    comparatorId: z.string().trim().min(1).max(120),
    role: z.enum([
      "direct_competitor",
      "operating_comparable",
      "valuation_proxy",
    ]),
    rationale: BilingualPublicTextSchema,
    comparableMetricKeys: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[a-z][a-z0-9_]*$/),
      )
      .min(1)
      .max(32)
      .refine(
        (values) => new Set(values).size === values.length,
        "duplicate comparable metric",
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const PersistedQuestionAnswerSchema = z
  .object({
    questionId: QuestionIdSchema,
    decisionKey: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9_]*$/),
    question: BilingualPublicTextSchema,
    answer: BilingualPublicTextSchema,
    primaryClaimIds: ClaimIdsSchema,
    evidenceArtifactIds: SourceArtifactIdsSchema,
    rank: z.number().int().positive().max(100),
  })
  .strict()
  .readonly();

import { z } from "zod";
import { ClaimIdSchema, ReportVersionIdSchema, SourceIdSchema } from "./ids";
import { SemanticVerdictSchema } from "./reportSemantic";
import { LocalizedTextSchema, ReportNarrativeTextSchema } from "./reportText";

export const ReportSectionSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: ReportNarrativeTextSchema,
    body: ReportNarrativeTextSchema,
    claimIds: z.array(ClaimIdSchema),
    sourceIds: z.array(SourceIdSchema),
  })
  .strict();
export const ScenarioAssumptionSchema = z
  .object({
    metric: z.enum(["revenue", "operating_margin", "diluted_eps"]),
    value: z.string().regex(/^-?\d+(?:\.\d+)?$/),
    unit: z.enum(["USD", "USD_per_share", "percent"]),
  })
  .strict();
export const ScenarioSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: ReportNarrativeTextSchema,
    assumptions: z.array(ScenarioAssumptionSchema).min(1),
    claimIds: z.array(ClaimIdSchema),
    sourceIds: z.array(SourceIdSchema),
  })
  .strict();
export const DissentSchema = z
  .object({
    id: z.string().min(1).max(80),
    claimId: ClaimIdSchema,
    sourceIds: z.array(SourceIdSchema),
    disposition: z.enum(["retained", "revised", "removed", "unresolved"]),
    text: ReportNarrativeTextSchema,
  })
  .strict();
export const UnknownSchema = z
  .object({
    id: z.string().min(1).max(80),
    impact: ReportNarrativeTextSchema,
    nextEvidence: ReportNarrativeTextSchema,
  })
  .strict();
export const LocalizedReportSchema = z
  .object({
    sections: z.array(ReportSectionSchema).min(1),
    scenarios: z.array(ScenarioSchema).min(1),
    dissent: z.array(DissentSchema),
    unknowns: z.array(UnknownSchema),
  })
  .strict();
export const VersionDeltaSchema = z
  .object({
    priorVersionId: ReportVersionIdSchema.nullable(),
    addedClaimIds: z.array(ClaimIdSchema),
    removedClaimIds: z.array(ClaimIdSchema),
  })
  .strict();
export const ClaimRegisterEntrySchema = z
  .object({
    claimId: ClaimIdSchema,
    text: LocalizedTextSchema.optional(),
    materiality: z.enum(["material", "supporting"]),
    semanticVerdict: SemanticVerdictSchema,
    sourceIds: z.array(SourceIdSchema),
  })
  .strict();
export const SourceRegisterEntrySchema = z
  .object({
    sourceId: SourceIdSchema,
    title: z.string().trim().min(1).max(500),
    publisher: z.string().trim().min(1).max(200),
    sourceClass: z.string().trim().min(1).max(80),
    dataset: z.string().trim().min(1).max(100).optional(),
    providerStatus: z
      .enum(["available", "stale", "unavailable", "withheld_by_rights"])
      .optional(),
    observedPeriod: z
      .object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        observationCount: z.number().int().nonnegative().optional(),
      })
      .strict()
      .refine((period) => period.from <= period.to, {
        message: "observed period cannot be reversed",
      })
      .optional(),
    limitations: z.array(z.string().trim().min(1).max(240)).max(32).optional(),
    observedOrFiledAt: z.string().datetime().optional(),
    retrievedAt: z.string().datetime(),
    freshness: z.enum(["current", "stale", "unavailable"]).optional(),
    url: z.string().url().optional(),
    excerpt: z.string().trim().min(1).max(1_500).optional(),
  })
  .strict();
export const DataCoverageSchema = z
  .object({
    dataset: z.string().trim().min(1).max(100),
    provider: z.string().trim().min(1).max(200),
    status: z.enum(["available", "stale", "unavailable", "withheld_by_rights"]),
    observedFrom: z.string().datetime().optional(),
    observedTo: z.string().datetime().optional(),
    observationCount: z.number().int().nonnegative().optional(),
    limitation: z.string().trim().min(1).max(240).optional(),
  })
  .strict()
  .superRefine((coverage, context) => {
    if (
      (coverage.observedFrom === undefined) !==
      (coverage.observedTo === undefined)
    )
      context.addIssue({
        code: "custom",
        message: "coverage period requires both endpoints",
      });
    if (
      coverage.observedFrom !== undefined &&
      coverage.observedTo !== undefined &&
      coverage.observedFrom > coverage.observedTo
    )
      context.addIssue({
        code: "custom",
        message: "coverage period cannot be reversed",
      });
  });
export const ProviderDisagreementSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    authoritativeSource: z.literal("sec_company_facts"),
    comparedSource: z.literal("insightsentry_rapidapi"),
    status: z.enum([
      "none_observed",
      "material_disagreement",
      "not_comparable",
    ]),
    note: z
      .object({
        en: z.string().trim().min(1).max(1_000),
        ko: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  })
  .strict();
export const StructuralMetricSchema = z
  .object({
    id: z.string().min(1).max(100),
    passed: z.number().int().nonnegative(),
    denominator: z.number().int().positive(),
  })
  .strict()
  .refine((metric) => metric.passed <= metric.denominator, {
    message: "passed cannot exceed denominator",
  });
export const CapabilitySummarySchema = z
  .object({
    key: z.string().min(1).max(80),
    availability: z.enum([
      "available",
      "stale",
      "unavailable",
      "withheld_by_rights",
    ]),
    limitationId: z.string().min(1).max(100).optional(),
  })
  .strict();
export const LimitationSchema = z
  .object({
    id: z.string().min(1).max(100),
    capability: z.string().min(1).max(80),
  })
  .strict();

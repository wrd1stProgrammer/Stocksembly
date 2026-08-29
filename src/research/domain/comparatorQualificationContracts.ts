import { z } from "zod";

const RoleSchema = z.enum([
  "direct_competitor",
  "operating_comparable",
  "valuation_proxy",
]);
const RationaleSchema = z
  .object({ en: z.string().trim().min(1), ko: z.string().trim().min(1) })
  .strict()
  .readonly();
const NormalizationSchema = z
  .object({
    value: z.number().finite(),
    period: z.string().trim().min(1),
    unit: z.string().trim().min(1),
    currency: z.string().trim().min(3).max(8).optional(),
    note: z.string().trim().min(1),
  })
  .strict()
  .readonly();
export const ComparableMetricSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]*$/u),
    value: z.number().finite(),
    period: z.string().trim().min(1),
    unit: z.string().trim().min(1),
    currency: z.string().trim().min(3).max(8).optional(),
    evidenceArtifactIds: z.array(z.string().trim().min(1)).min(1).readonly(),
    sourcePurpose: z.enum(["valuation_metric", "operating_metric"]).optional(),
    normalization: NormalizationSchema.optional(),
  })
  .strict()
  .readonly();
const ProfileShape = {
  comparatorId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  sector: z.string().trim().min(1).optional(),
  primaryProductMarket: z.string().trim().min(1),
  primaryCustomerMarket: z.string().trim().min(1),
  metrics: z.array(ComparableMetricSchema).min(1).max(32).readonly(),
  canonicalIdentity: z
    .object({
      cik: z.string().trim().min(1),
      ticker: z.string().trim().min(1),
      exchange: z.string().trim().min(1).max(80),
      securityClass: z.enum([
        "common_stock",
        "fund",
        "adr",
        "preferred",
        "unit",
        "warrant",
        "debt",
        "unknown",
      ]),
      sector: z.string().trim().min(1),
      industry: z.string().trim().min(1).optional(),
      primaryProductMarket: z.string().trim().min(1),
      primaryCustomerMarket: z.string().trim().min(1),
      sourcePurposes: z
        .array(z.enum(["issuer_identity", "business_overlap"]))
        .readonly(),
    })
    .strict()
    .readonly()
    .optional(),
  securityQualification: z.enum(["eligible", "not_eligible"]).optional(),
} as const;
const ComparatorProfileSchema = z
  .object({ ...ProfileShape, role: RoleSchema, rationale: RationaleSchema })
  .strict()
  .readonly();
export const ComparatorQualificationInputSchema = z
  .object({
    rawPeerArtifactId: z.string().trim().min(1),
    subject: z.object(ProfileShape).strict().readonly(),
    comparators: z.array(ComparatorProfileSchema).max(64).readonly(),
  })
  .strict()
  .readonly();
export const ExclusionReasonSchema = z.enum([
  "duplicate_comparator",
  "industry_mismatch",
  "market_overlap_required",
  "insufficient_aligned_metrics",
  "operating_metric_required",
  "operating_valuation_normalization_required",
  "valuation_metric_required",
  "period_mismatch",
  "unit_mismatch",
  "currency_mismatch",
  "issuer_identity_unresolved",
  "security_class_mismatch",
  "business_mismatch",
  "source_purpose_mismatch",
]);
export const NormalizedMetricSchema = z
  .object({
    key: z.string().min(1),
    value: z.number().finite(),
    period: z.string().min(1),
    unit: z.string().min(1),
    currency: z.string().min(1).optional(),
    normalizationNote: z.string().min(1).optional(),
    evidenceArtifactIds: z.array(z.string().min(1)).min(1).readonly(),
  })
  .strict()
  .readonly();
const RowSchema = z
  .object({
    comparatorId: z.string().min(1),
    name: z.string().min(1),
    role: RoleSchema,
    rationale: RationaleSchema,
    comparableMetricKeys: z.array(z.string().min(1)).readonly(),
    normalizedMetrics: z.array(NormalizedMetricSchema).readonly(),
    normalizedIdentity: z
      .object({
        cik: z.string().min(1),
        ticker: z.string().min(1),
        exchange: z.enum(["NASDAQ", "NYSE", "NYSE_AMERICAN"]),
        securityClass: z.enum([
          "common_stock",
          "fund",
          "adr",
          "preferred",
          "unit",
          "warrant",
          "debt",
          "unknown",
        ]),
      })
      .strict()
      .readonly()
      .optional(),
    normalizationNote: z.string().min(1).optional(),
    normalizationAttemptCount: z.number().int().min(0).max(1).optional(),
    evidenceArtifactIds: z.array(z.string().min(1)).readonly(),
    displayEligibility: z.boolean(),
    medianEligibility: z.boolean(),
    exclusionReasons: z.array(ExclusionReasonSchema).readonly(),
  })
  .strict()
  .readonly();
const ValuationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("eligible"),
    metricKey: z.string().min(1),
    peerMedian: z.number().finite(),
    subjectValue: z.number().finite(),
    premiumDiscountPercent: z.number().finite(),
    eligibleCompanyCount: z.number().int().min(3),
    period: z.string().min(1),
    unit: z.string().min(1),
    currency: z.string().min(1).optional(),
    evidenceArtifactIds: z.array(z.string().min(1)).min(1).readonly(),
  }),
  z.strictObject({
    status: z.literal("not_eligible"),
    reason: z.enum([
      "valuation_metric_unavailable",
      "insufficient_eligible_companies",
    ]),
    eligibleCompanyCount: z.number().int().nonnegative(),
  }),
]);
export const ComparatorQualificationResultSchema = z
  .object({
    status: z.enum(["qualified", "no_qualified_comparison"]),
    rawPeerArtifactId: z.string().min(1),
    rawArtifactCount: z.number().int().nonnegative(),
    rows: z.array(RowSchema).readonly(),
    displayGroups: z
      .array(
        z.strictObject({
          role: RoleSchema,
          comparatorIds: z.array(z.string().min(1)).min(1).readonly(),
        }),
      )
      .readonly(),
    diagnostics: z
      .object({
        candidateCount: z.number().int().nonnegative(),
        displayEligibleCount: z.number().int().nonnegative(),
        medianEligibleCount: z.number().int().nonnegative(),
        roleCounts: z
          .array(
            z.strictObject({
              role: RoleSchema,
              candidateCount: z.number().int().nonnegative(),
              displayEligibleCount: z.number().int().nonnegative(),
            }),
          )
          .readonly(),
        exclusionCounts: z
          .array(
            z.strictObject({
              reason: ExclusionReasonSchema,
              count: z.number().int().positive(),
            }),
          )
          .readonly(),
        primaryExclusionReason: ExclusionReasonSchema.optional(),
      })
      .strict()
      .readonly()
      .optional(),
    valuation: ValuationSchema,
  })
  .strict()
  .readonly();

export type ComparatorQualificationInput = z.infer<
  typeof ComparatorQualificationInputSchema
>;
export type ComparatorQualificationResult = z.infer<
  typeof ComparatorQualificationResultSchema
>;
export type ComparableMetric = z.infer<typeof ComparableMetricSchema>;
export type NormalizedMetric = z.infer<typeof NormalizedMetricSchema>;
export type ExclusionReason = z.infer<typeof ExclusionReasonSchema>;

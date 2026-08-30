import { z } from "zod";
import { PublicationStatusSchema, StructuralMetricSchema } from "./report";

export const PublicClaimPublicationActionSchema = z.enum([
  "publish",
  "limitations_only",
  "omit",
]);
export type PublicClaimPublicationAction = z.infer<
  typeof PublicClaimPublicationActionSchema
>;

const QualityCapabilitySchema = z
  .object({
    key: z.string().min(1).max(80),
    availability: z.enum([
      "available",
      "stale",
      "unavailable",
      "withheld_by_rights",
    ]),
  })
  .strict();
const QualityClaimSchema = z
  .object({
    claimId: z.string().min(1).max(100),
    materiality: z.enum(["material", "supporting"]),
    support: z.enum(["supported", "unsupported"]),
    semanticVerdict: z.enum([
      "entailed",
      "partial",
      "contradicted",
      "not_assessable",
    ]),
  })
  .strict();

export const PublicationQualityInputSchema = z
  .object({
    requestedStatus: PublicationStatusSchema,
    acceptedArtifactCount: z.number().int().nonnegative(),
    requiredArtifactCount: z.literal(12),
    capabilities: z.array(QualityCapabilitySchema),
    claims: z.array(QualityClaimSchema),
    metrics: z.array(StructuralMetricSchema).min(1),
  })
  .strict();
export type PublicationQualityInput = z.infer<
  typeof PublicationQualityInputSchema
>;
export type PublicationQualityResult = {
  readonly publishable: boolean;
  readonly status: z.infer<typeof PublicationStatusSchema>;
  readonly blockers: readonly string[];
};

export function evaluatePublicationQuality(
  input: unknown,
): PublicationQualityResult {
  const quality = PublicationQualityInputSchema.parse(input);
  const blockers: string[] = [];
  if (quality.acceptedArtifactCount !== quality.requiredArtifactCount)
    blockers.push("required_artifacts_missing");
  for (const claim of quality.claims) {
    if (claim.materiality !== "material") continue;
    if (claim.support === "unsupported")
      blockers.push(`material_claim_unsupported:${claim.claimId}`);
    else if (claim.semanticVerdict === "contradicted")
      blockers.push(`material_claim_${claim.semanticVerdict}:${claim.claimId}`);
  }
  for (const metric of quality.metrics)
    if (metric.passed !== metric.denominator)
      blockers.push(`quality_gate_failed:${metric.id}`);
  if (blockers.length > 0)
    return { publishable: false, status: "incomplete", blockers };
  const hasLimitations =
    quality.capabilities.some(
      (capability) => capability.availability !== "available",
    ) ||
    quality.claims.some(
      (claim) =>
        claim.semanticVerdict === "partial" ||
        claim.semanticVerdict === "not_assessable",
    );
  const status = hasLimitations ? "complete_with_limitations" : "complete";
  if (quality.requestedStatus === "complete" && status !== "complete")
    return {
      publishable: false,
      status: "incomplete",
      blockers: [
        `requested_status_mismatch:${quality.requestedStatus}:${status}`,
      ],
    };
  return { publishable: true, status: quality.requestedStatus, blockers: [] };
}

import { z } from "zod";
import {
  type PublicClaimPublicationAction,
  PublicClaimPublicationActionSchema,
} from "./qualityPolicy";
import { SemanticVerdictSchema } from "./reportSemantic";

const ClaimIdSchema = z.string().trim().min(1).max(100);
const MaterialitySchema = z.enum(["material", "supporting"]);
const AnalyticalInputSchema = z
  .object({
    claimId: ClaimIdSchema,
    semanticVerdict: SemanticVerdictSchema,
  })
  .strict();
const AnalyticalLineageSchema = z
  .object({
    kind: z.enum(["calculation", "reasoning"]),
    inputClaimIds: z.array(ClaimIdSchema).min(1),
  })
  .strict();

const FactualClaimSchema = z
  .object({
    claimId: ClaimIdSchema,
    kind: z.literal("factual_claim"),
    materiality: MaterialitySchema,
    semanticVerdict: SemanticVerdictSchema,
  })
  .strict();
const AnalyticalClaimSchema = z
  .object({
    claimId: ClaimIdSchema,
    kind: z.literal("analytical_conclusion"),
    materiality: MaterialitySchema,
    inputFacts: z.array(AnalyticalInputSchema).min(1),
    lineage: AnalyticalLineageSchema,
  })
  .strict()
  .superRefine((claim, context) => {
    const inputIds = new Set(claim.inputFacts.map((input) => input.claimId));
    const lineageIds = new Set(claim.lineage.inputClaimIds);
    if (inputIds.size !== claim.inputFacts.length)
      context.addIssue({
        code: "custom",
        message: "analytical input claim ids must be unique",
      });
    if (lineageIds.size !== claim.lineage.inputClaimIds.length)
      context.addIssue({
        code: "custom",
        message: "analytical lineage input ids must be unique",
      });
  });

export const PublicClaimInputSchema = z.discriminatedUnion("kind", [
  FactualClaimSchema,
  AnalyticalClaimSchema,
]);
export type PublicClaimInput = z.infer<typeof PublicClaimInputSchema>;

export const PublicClaimEligibilityStateSchema = z.enum([
  "entailed",
  "derived_supported",
  "partial",
  "not_assessable",
  "contradicted",
  "invalid",
]);
export type PublicClaimEligibilityState = z.infer<
  typeof PublicClaimEligibilityStateSchema
>;
export const PublicClaimEligibilityReasonCodeSchema = z.enum([
  "fact_entailed",
  "fact_partial",
  "fact_not_assessable",
  "fact_contradicted",
  "analytical_derived_supported",
  "analytical_partial_input",
  "analytical_input_not_entailed",
  "analytical_lineage_incomplete",
  "analytical_grounded_input_absent",
  "invalid_public_claim",
]);
export type PublicClaimEligibilityReasonCode = z.infer<
  typeof PublicClaimEligibilityReasonCodeSchema
>;
export type PublicClaimEligibility = {
  readonly claimId?: string;
  readonly action: PublicClaimPublicationAction;
  readonly eligibility: PublicClaimEligibilityState;
  readonly reasonCode: PublicClaimEligibilityReasonCode;
};

const PublicClaimEligibilityReportInputSchema = z
  .object({ claims: z.array(z.unknown()) })
  .strict();
export type PublicClaimEligibilityReport = {
  readonly claims: readonly PublicClaimEligibility[];
  readonly publishable: boolean;
  readonly blockers: readonly ["no_grounded_core_answer"] | readonly [];
};

function assertNever(value: never): never {
  throw new Error(`Unhandled public claim eligibility value: ${value}`);
}

function evaluateFactualClaim(
  claim: Extract<PublicClaimInput, { readonly kind: "factual_claim" }>,
): PublicClaimEligibility {
  switch (claim.semanticVerdict) {
    case "entailed":
      return {
        claimId: claim.claimId,
        action: PublicClaimPublicationActionSchema.enum.publish,
        eligibility: "entailed",
        reasonCode: "fact_entailed",
      };
    case "partial":
      return {
        claimId: claim.claimId,
        action: PublicClaimPublicationActionSchema.enum.limitations_only,
        eligibility: "partial",
        reasonCode: "fact_partial",
      };
    case "not_assessable":
      return {
        claimId: claim.claimId,
        action: PublicClaimPublicationActionSchema.enum.omit,
        eligibility: "not_assessable",
        reasonCode: "fact_not_assessable",
      };
    case "contradicted":
      return {
        claimId: claim.claimId,
        action: PublicClaimPublicationActionSchema.enum.omit,
        eligibility: "contradicted",
        reasonCode: "fact_contradicted",
      };
    default:
      return assertNever(claim.semanticVerdict);
  }
}

function hasCompleteLineage(
  claim: Extract<PublicClaimInput, { readonly kind: "analytical_conclusion" }>,
): boolean {
  const inputIds = new Set(claim.inputFacts.map((input) => input.claimId));
  return (
    inputIds.size === claim.lineage.inputClaimIds.length &&
    claim.lineage.inputClaimIds.every((inputClaimId) =>
      inputIds.has(inputClaimId),
    )
  );
}

function evaluateAnalyticalClaim(
  claim: Extract<PublicClaimInput, { readonly kind: "analytical_conclusion" }>,
  groundedFactualClaimIds?: ReadonlySet<string>,
): PublicClaimEligibility {
  if (!hasCompleteLineage(claim))
    return {
      claimId: claim.claimId,
      action: PublicClaimPublicationActionSchema.enum.omit,
      eligibility: "invalid",
      reasonCode: "analytical_lineage_incomplete",
    };
  if (claim.inputFacts.some((input) => input.semanticVerdict === "partial"))
    return {
      claimId: claim.claimId,
      action: PublicClaimPublicationActionSchema.enum.limitations_only,
      eligibility: "partial",
      reasonCode: "analytical_partial_input",
    };
  if (claim.inputFacts.some((input) => input.semanticVerdict !== "entailed"))
    return {
      claimId: claim.claimId,
      action: PublicClaimPublicationActionSchema.enum.omit,
      eligibility: "invalid",
      reasonCode: "analytical_input_not_entailed",
    };
  if (
    groundedFactualClaimIds !== undefined &&
    !claim.inputFacts.every((input) =>
      groundedFactualClaimIds.has(input.claimId),
    )
  )
    return {
      claimId: claim.claimId,
      action: PublicClaimPublicationActionSchema.enum.omit,
      eligibility: "invalid",
      reasonCode: "analytical_grounded_input_absent",
    };
  return {
    claimId: claim.claimId,
    action: PublicClaimPublicationActionSchema.enum.publish,
    eligibility: "derived_supported",
    reasonCode: "analytical_derived_supported",
  };
}

export function evaluatePublicClaimEligibility(
  input: unknown,
  groundedFactualClaimIds?: ReadonlySet<string>,
): PublicClaimEligibility {
  const parsed = PublicClaimInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      action: PublicClaimPublicationActionSchema.enum.omit,
      eligibility: "invalid",
      reasonCode: "invalid_public_claim",
    };
  switch (parsed.data.kind) {
    case "factual_claim":
      return evaluateFactualClaim(parsed.data);
    case "analytical_conclusion":
      return evaluateAnalyticalClaim(parsed.data, groundedFactualClaimIds);
    default:
      return assertNever(parsed.data);
  }
}

export function evaluatePublicClaimEligibilityReport(
  input: unknown,
): PublicClaimEligibilityReport {
  const parsed = PublicClaimEligibilityReportInputSchema.safeParse(input);
  const groundedFactualClaimIds = new Set<string>();
  if (parsed.success)
    for (const inputClaim of parsed.data.claims) {
      const claim = PublicClaimInputSchema.safeParse(inputClaim);
      if (!claim.success) continue;
      switch (claim.data.kind) {
        case "factual_claim":
          if (evaluateFactualClaim(claim.data).action === "publish")
            groundedFactualClaimIds.add(claim.data.claimId);
          break;
        case "analytical_conclusion":
          break;
        default:
          assertNever(claim.data);
      }
    }
  const claims = parsed.success
    ? parsed.data.claims.map((claim) =>
        evaluatePublicClaimEligibility(claim, groundedFactualClaimIds),
      )
    : [];
  const hasGroundedCoreAnswer = parsed.success
    ? parsed.data.claims.some((claim) => {
        const parsedClaim = PublicClaimInputSchema.safeParse(claim);
        return (
          parsedClaim.success &&
          parsedClaim.data.materiality === "material" &&
          evaluatePublicClaimEligibility(
            parsedClaim.data,
            groundedFactualClaimIds,
          ).action === "publish"
        );
      })
    : false;
  if (!hasGroundedCoreAnswer)
    return {
      claims,
      publishable: false,
      blockers: ["no_grounded_core_answer"],
    };
  return { claims, publishable: true, blockers: [] };
}

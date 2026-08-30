import { z } from "zod";
import {
  EVIDENCE_DATASETS,
  SOURCE_PURPOSES,
  SourceLocatorSchema,
  type SourcePurpose,
} from "./evidenceCoreSchemas";
import { sourcePurposesFor } from "./sourcePurposeRegistry";

export { SOURCE_PURPOSES, type SourcePurpose } from "./evidenceCoreSchemas";
export { sourcePurposesFor } from "./sourcePurposeRegistry";

const SourcePurposeSchema = z.enum(SOURCE_PURPOSES);
const SemanticVerdictSchema = z.enum([
  "entailed",
  "partial",
  "contradicted",
  "not_assessable",
]);
const RegisteredValueSchema = z
  .object({
    claimId: z.string().trim().min(1).max(240),
    valueId: z.string().trim().min(1).max(240),
    artifactId: z.string().trim().min(1).max(240),
    value: z.string().trim().min(1).max(240),
    period: z.string().trim().min(1).max(240),
    unit: z.string().trim().min(1).max(64),
  })
  .strict();
const ArtifactValueSchema = RegisteredValueSchema.omit({
  claimId: true,
  artifactId: true,
});
const ExactSliceSchema = z
  .object({
    sliceId: z.string().trim().min(1).max(240),
    artifactId: z.string().trim().min(1).max(240),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
  })
  .strict()
  .refine((slice) => slice.startOffset < slice.endOffset, {
    message: "exact slice must have a positive span",
    path: ["endOffset"],
  });

export const SourcePurposeBindingSchema = z
  .object({
    claimId: z.string().trim().min(1).max(240),
    purpose: SourcePurposeSchema,
    registeredValue: RegisteredValueSchema,
    artifact: z
      .object({
        artifactId: z.string().trim().min(1).max(240),
        dataset: z.enum(EVIDENCE_DATASETS),
        locator: SourceLocatorSchema,
        registeredValues: z.array(ArtifactValueSchema).min(1).max(128),
        exactSlices: z.array(ExactSliceSchema).min(1).max(128),
      })
      .strict(),
    exactSlice: ExactSliceSchema,
    semanticVerdict: SemanticVerdictSchema,
  })
  .strict();
export type SourcePurposeBinding = z.infer<typeof SourcePurposeBindingSchema>;

export type SourcePurposeBindingResult =
  | {
      readonly kind: "eligible";
      readonly claimId: string;
      readonly purpose: SourcePurpose;
    }
  | {
      readonly kind: "ineligible";
      readonly claimId: string;
      readonly reason:
        | "source_purpose_binding_malformed"
        | "source_purpose_claim_value_mismatch"
        | "source_purpose_value_artifact_mismatch"
        | "source_purpose_value_unregistered"
        | "source_purpose_value_unit_mismatch"
        | "source_purpose_exact_slice_mismatch"
        | "source_purpose_semantic_verdict_ineligible"
        | "source_purpose_not_allowed";
    };

function claimIdFrom(input: unknown): string {
  if (
    typeof input === "object" &&
    input !== null &&
    "claimId" in input &&
    typeof input.claimId === "string"
  )
    return input.claimId;
  return "unknown_claim";
}

export function validateSourcePurposeBinding(
  input: unknown,
): SourcePurposeBindingResult {
  const parsed = SourcePurposeBindingSchema.safeParse(input);
  if (!parsed.success)
    return {
      kind: "ineligible",
      claimId: claimIdFrom(input),
      reason: "source_purpose_binding_malformed",
    };
  const binding = parsed.data;
  if (binding.registeredValue.claimId !== binding.claimId)
    return {
      kind: "ineligible",
      claimId: binding.claimId,
      reason: "source_purpose_claim_value_mismatch",
    };
  if (binding.registeredValue.artifactId !== binding.artifact.artifactId)
    return {
      kind: "ineligible",
      claimId: binding.claimId,
      reason: "source_purpose_value_artifact_mismatch",
    };
  if (
    !binding.artifact.registeredValues.some(
      (value) =>
        value.valueId === binding.registeredValue.valueId &&
        value.value === binding.registeredValue.value &&
        value.period === binding.registeredValue.period &&
        value.unit === binding.registeredValue.unit,
    )
  )
    return {
      kind: "ineligible",
      claimId: binding.claimId,
      reason: "source_purpose_value_unregistered",
    };
  if (
    "unit" in binding.artifact.locator &&
    binding.artifact.locator.unit !== binding.registeredValue.unit
  )
    return {
      kind: "ineligible",
      claimId: binding.claimId,
      reason: "source_purpose_value_unit_mismatch",
    };
  if (
    binding.exactSlice.artifactId !== binding.artifact.artifactId ||
    !binding.artifact.exactSlices.some(
      (slice) =>
        slice.sliceId === binding.exactSlice.sliceId &&
        slice.artifactId === binding.exactSlice.artifactId &&
        slice.startOffset === binding.exactSlice.startOffset &&
        slice.endOffset === binding.exactSlice.endOffset,
    )
  )
    return {
      kind: "ineligible",
      claimId: binding.claimId,
      reason: "source_purpose_exact_slice_mismatch",
    };
  if (binding.semanticVerdict !== "entailed")
    return {
      kind: "ineligible",
      claimId: binding.claimId,
      reason: "source_purpose_semantic_verdict_ineligible",
    };
  if (
    !sourcePurposesFor({
      dataset: binding.artifact.dataset,
      locator: binding.artifact.locator,
    }).includes(binding.purpose)
  )
    return {
      kind: "ineligible",
      claimId: binding.claimId,
      reason: "source_purpose_not_allowed",
    };
  return {
    kind: "eligible",
    claimId: binding.claimId,
    purpose: binding.purpose,
  };
}

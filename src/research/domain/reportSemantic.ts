import { z } from "zod";
import {
  ArtifactIdSchema,
  ClaimIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "./ids";

export const SemanticVerdictSchema = z.enum([
  "entailed",
  "partial",
  "contradicted",
  "not_assessable",
]);
export type SemanticVerdict = z.infer<typeof SemanticVerdictSchema>;

export const SemanticClaimVerdictSchema = z
  .object({
    claimId: ClaimIdSchema,
    materiality: z.enum(["material", "supporting"]),
    verdict: SemanticVerdictSchema,
    contradictionSeverity: z.enum(["none", "limited", "severe"]),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

const SemanticMetricSchema = z
  .object({
    id: z.string().min(1).max(100),
    passed: z.number().int().nonnegative(),
    denominator: z.number().int().positive(),
  })
  .strict()
  .refine((metric) => metric.passed <= metric.denominator, {
    message: "passed cannot exceed denominator",
  });

export const SemanticAuditSchema = z
  .object({
    schemaVersion: z.literal("workflow-v1"),
    artifactId: ArtifactIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    reportVersionId: ReportVersionIdSchema,
    verdicts: z.array(SemanticClaimVerdictSchema),
    metrics: z.array(SemanticMetricSchema).min(1),
  })
  .strict()
  .refine(
    (audit) =>
      new Set(audit.verdicts.map((verdict) => verdict.claimId)).size ===
      audit.verdicts.length,
    { message: "semantic claim verdicts must be unique" },
  );
export type SemanticAudit = z.infer<typeof SemanticAuditSchema>;

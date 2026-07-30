import { z } from "zod";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "./ids";
import {
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_ROLE_REGISTRY,
} from "./roleRegistry";

export const MEMO_ARTIFACT_ROLES = [
  "market",
  "market_news",
  "benchmark",
  "company",
  "company_product",
  "company_competition",
  "financial",
  "valuation",
  "financial_quality",
  "risk",
  "risk_policy",
] as const;
export const REQUIRED_REPORT_ARTIFACT_ROLES = [
  ...MEMO_ARTIFACT_ROLES,
  "chair",
] as const;
export const WORKFLOW_V1_REPORT_LOGICAL_ARTIFACT_IDS = {
  market: "memo:market",
  market_news: "memo:market_news",
  benchmark: "memo:benchmark",
  company: "memo:company",
  company_product: "memo:company_product",
  company_competition: "memo:company_competition",
  financial: "memo:financial",
  valuation: "memo:valuation",
  financial_quality: "memo:financial_quality",
  risk: "memo:risk",
  risk_policy: "memo:risk_policy",
  chair: "chair_synthesis:chair",
} as const;

export const AcceptedArtifactProvenanceSchema = z
  .object({
    artifactId: ArtifactIdSchema,
    logicalArtifactId: z.string().min(1).max(160),
    roleId: z.enum(REQUIRED_REPORT_ARTIFACT_ROLES),
    stage: z.enum(["memo", "chair_synthesis"]),
    status: z.literal("accepted"),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
  })
  .strict()
  .refine(
    (artifact) =>
      artifact.logicalArtifactId ===
      WORKFLOW_V1_REPORT_LOGICAL_ARTIFACT_IDS[artifact.roleId],
    { message: "logical artifact ID must match the WorkflowV1 role" },
  );
export type AcceptedArtifactProvenance = z.infer<
  typeof AcceptedArtifactProvenanceSchema
>;

export const DepartmentReportArtifactProvenanceSchema = z
  .object({
    artifactId: ArtifactIdSchema,
    logicalArtifactId: z.string().min(1).max(160),
    roleId: z.enum(REQUIRED_REPORT_ARTIFACT_ROLES),
    stage: z.enum(["memo", "department_consolidation"]),
    status: z.literal("accepted"),
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
  })
  .strict()
  .superRefine((artifact, context) => {
    if (artifact.stage === "memo") {
      if (artifact.logicalArtifactId !== `memo:${artifact.roleId}`)
        context.addIssue({
          code: "custom",
          message: "memo logical artifact ID must match its role",
        });
      return;
    }
    const departmentId = WORKFLOW_V1_DEPARTMENT_IDS.find(
      (candidate) =>
        WORKFLOW_V1_ROLE_REGISTRY.departments[candidate].leadId ===
        artifact.roleId,
    );
    if (
      departmentId === undefined ||
      artifact.logicalArtifactId !== `consolidation:${departmentId}`
    )
      context.addIssue({
        code: "custom",
        message: "department consolidation must be owned by its team lead",
      });
  });
export type DepartmentReportArtifactProvenance = z.infer<
  typeof DepartmentReportArtifactProvenanceSchema
>;

export type ArtifactProvenanceContext = {
  readonly artifacts: readonly AcceptedArtifactProvenance[];
  readonly runId: string;
  readonly snapshotId: string;
};

export function artifactProvenanceErrors(
  input: ArtifactProvenanceContext,
): readonly string[] {
  const errors: string[] = [];
  const artifactIds = new Set(input.artifacts.map((entry) => entry.artifactId));
  const logicalIds = new Set(
    input.artifacts.map((entry) => entry.logicalArtifactId),
  );
  const roles = new Set(input.artifacts.map((entry) => entry.roleId));
  if (artifactIds.size !== input.artifacts.length)
    errors.push("artifact IDs must be unique");
  if (logicalIds.size !== input.artifacts.length)
    errors.push("logical artifact IDs must be unique");
  if (
    roles.size !== REQUIRED_REPORT_ARTIFACT_ROLES.length ||
    REQUIRED_REPORT_ARTIFACT_ROLES.some((role) => !roles.has(role))
  )
    errors.push("all eleven specialist memos and chair are required");
  for (const artifact of input.artifacts) {
    if (
      artifact.runId !== input.runId ||
      artifact.snapshotId !== input.snapshotId
    )
      errors.push(`artifact lineage mismatch:${artifact.roleId}`);
    const expectedStage =
      artifact.roleId === "chair" ? "chair_synthesis" : "memo";
    if (artifact.stage !== expectedStage)
      errors.push(`artifact stage mismatch:${artifact.roleId}`);
    if (
      artifact.logicalArtifactId !==
      WORKFLOW_V1_REPORT_LOGICAL_ARTIFACT_IDS[artifact.roleId]
    )
      errors.push(`artifact logical ID mismatch:${artifact.roleId}`);
  }
  return errors;
}

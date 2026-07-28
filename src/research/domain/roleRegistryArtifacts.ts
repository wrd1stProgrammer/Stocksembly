import type {
  AgentOutputStage,
  WorkflowActorId,
  WorkflowDepartmentId,
} from "./roleRegistry";
import { isWorkflowStageOwner, workflowRoleById } from "./roleRegistry";

export type ArtifactOwnerId = WorkflowActorId | "system";

export type RequiredArtifactSlot = {
  readonly logicalArtifactId: string;
  readonly stage: AgentOutputStage;
  readonly ownerId: ArtifactOwnerId;
  readonly departmentId: WorkflowDepartmentId | null;
};

export const WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS = [
  {
    logicalArtifactId: "memo:market",
    stage: "memo",
    ownerId: "market",
    departmentId: "market",
  },
  {
    logicalArtifactId: "memo:market_news",
    stage: "memo",
    ownerId: "market_news",
    departmentId: "market",
  },
  {
    logicalArtifactId: "memo:benchmark",
    stage: "memo",
    ownerId: "benchmark",
    departmentId: "market",
  },
  {
    logicalArtifactId: "memo:company",
    stage: "memo",
    ownerId: "company",
    departmentId: "company",
  },
  {
    logicalArtifactId: "memo:company_product",
    stage: "memo",
    ownerId: "company_product",
    departmentId: "company",
  },
  {
    logicalArtifactId: "memo:company_competition",
    stage: "memo",
    ownerId: "company_competition",
    departmentId: "company",
  },
  {
    logicalArtifactId: "memo:financial",
    stage: "memo",
    ownerId: "financial",
    departmentId: "financial",
  },
  {
    logicalArtifactId: "memo:valuation",
    stage: "memo",
    ownerId: "valuation",
    departmentId: "financial",
  },
  {
    logicalArtifactId: "memo:financial_quality",
    stage: "memo",
    ownerId: "financial_quality",
    departmentId: "financial",
  },
  {
    logicalArtifactId: "memo:risk",
    stage: "memo",
    ownerId: "risk",
    departmentId: "risk",
  },
  {
    logicalArtifactId: "memo:risk_policy",
    stage: "memo",
    ownerId: "risk_policy",
    departmentId: "risk",
  },
  ...(["market", "company", "financial", "risk"] as const).map(
    (departmentId) => ({
      logicalArtifactId: `consolidation:${departmentId}`,
      stage: "department_consolidation" as const,
      ownerId: departmentId,
      departmentId,
    }),
  ),
  ...(["market", "company", "financial", "risk"] as const).map(
    (departmentId) => ({
      logicalArtifactId: `challenge:${departmentId}`,
      stage: "blind_challenge" as const,
      ownerId: departmentId,
      departmentId,
    }),
  ),
  ...(["market", "company", "financial", "risk"] as const).map(
    (departmentId) => ({
      logicalArtifactId: `response_ballot:${departmentId}`,
      stage: "owner_response_ballot" as const,
      ownerId: departmentId,
      departmentId,
    }),
  ),
  {
    logicalArtifactId: "semantic_audit:system",
    stage: "semantic_audit",
    ownerId: "system",
    departmentId: null,
  },
  {
    logicalArtifactId: "chair_synthesis:chair",
    stage: "chair_synthesis",
    ownerId: "chair",
    departmentId: null,
  },
] as const satisfies readonly RequiredArtifactSlot[];

export function requiredArtifactSlotById(
  logicalArtifactId: string,
): RequiredArtifactSlot | undefined {
  const required = WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.find(
    (slot) => slot.logicalArtifactId === logicalArtifactId,
  );
  if (required !== undefined) return required;
  if (!logicalArtifactId.startsWith("followup:")) return undefined;
  const ownerId = logicalArtifactId.replace(/^followup:/, "");
  const role = workflowRoleById(ownerId);
  return role === undefined ||
    role.id === "chair" ||
    role.departmentId === "chair"
    ? undefined
    : {
        logicalArtifactId,
        stage: "follow_up",
        ownerId: role.id,
        departmentId: role.departmentId,
      };
}

export function isArtifactStageOwner(
  stage: AgentOutputStage,
  ownerId: ArtifactOwnerId,
): boolean {
  return stage === "semantic_audit"
    ? ownerId === "system"
    : ownerId !== "system" && isWorkflowStageOwner(stage, ownerId);
}

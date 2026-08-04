import { z } from "zod";
import { assertNever } from "./ids";
import { WORKFLOW_V1_ROLES } from "./roleRegistryData";

export const WORKFLOW_V1_VERSION = "WorkflowV1" as const;

export const WORKFLOW_V1_SPECIALIST_IDS = [
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
export type SpecialistRoleId = (typeof WORKFLOW_V1_SPECIALIST_IDS)[number];

export const WORKFLOW_V1_CHAIR_ID = "chair" as const;
export type ChairRoleId = typeof WORKFLOW_V1_CHAIR_ID;
export type WorkflowRoleId = SpecialistRoleId | ChairRoleId;

export const WORKFLOW_V1_DEPARTMENT_IDS = [
  "market",
  "company",
  "financial",
  "risk",
] as const;
export type WorkflowDepartmentId = (typeof WORKFLOW_V1_DEPARTMENT_IDS)[number];

export const AGENT_OUTPUT_STAGES = [
  "memo",
  "department_consolidation",
  "blind_challenge",
  "owner_response_ballot",
  "follow_up",
  "semantic_audit",
  "chair_synthesis",
] as const;
export const AgentOutputStageSchema = z.enum(AGENT_OUTPUT_STAGES);
export type AgentOutputStage = z.infer<typeof AgentOutputStageSchema>;
export const WorkflowActorIdSchema = z.enum([
  ...WORKFLOW_V1_SPECIALIST_IDS,
  WORKFLOW_V1_CHAIR_ID,
]);
export type WorkflowActorId = z.infer<typeof WorkflowActorIdSchema>;

export const EVIDENCE_NEEDS = [
  "issuer_identity",
  "sec_primary_filings",
  "sec_current_reports",
  "sec_company_facts",
  "sec_amendment_lineage",
  "sec_insider_transactions",
  "sec_beneficial_ownership",
  "bls_cpi",
  "bls_core_cpi",
  "bls_unemployment",
  "bls_nonfarm_payrolls",
  "bls_average_hourly_earnings",
  "bls_producer_prices",
  "treasury_yield_curve",
  "provider_technical_1h",
  "provider_technical_4h",
  "provider_fundamentals",
  "provider_peer_context",
  "categorized_news_events",
  "observed_provider_coverage",
  "capability_posture",
  "question_mandate",
  "accepted_agent_artifacts",
  "audited_claim_register",
  "department_ballots",
] as const;
export type EvidenceNeed = (typeof EVIDENCE_NEEDS)[number];

export type WorkflowRole = {
  readonly id: WorkflowRoleId;
  readonly name: string;
  readonly departmentId: WorkflowDepartmentId | "chair";
  readonly isDepartmentLead: boolean;
  readonly evidenceNeeds: readonly EvidenceNeed[];
};

export const WORKFLOW_V1_ROSTER_FINGERPRINT =
  "WorkflowV1|market:Maya:market:lead|market_news:June:market:member|benchmark:Alex:market:member|company:Ethan:company:lead|company_product:Aria:company:member|company_competition:Leo:company:member|financial:Noah:financial:lead|valuation:Sofia:financial:member|financial_quality:Hana:financial:member|risk:Liam:risk:lead|risk_policy:Min:risk:member|chair:Dr. Park:chair:chair" as const;

export const WORKFLOW_V1_ROLE_REGISTRY = {
  version: WORKFLOW_V1_VERSION,
  rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
  roles: WORKFLOW_V1_ROLES,
  departments: {
    market: {
      leadId: "market",
      memberIds: ["market", "market_news", "benchmark"],
    },
    company: {
      leadId: "company",
      memberIds: ["company", "company_product", "company_competition"],
    },
    financial: {
      leadId: "financial",
      memberIds: ["financial", "valuation", "financial_quality"],
    },
    risk: { leadId: "risk", memberIds: ["risk", "risk_policy"] },
  },
} as const;

const DEPARTMENT_LEADS = ["market", "company", "financial", "risk"] as const;

export function workflowStageOwners(
  stageInput: unknown,
): readonly WorkflowActorId[] {
  const stage = AgentOutputStageSchema.parse(stageInput);
  switch (stage) {
    case "memo":
    case "follow_up":
      return WORKFLOW_V1_SPECIALIST_IDS;
    case "department_consolidation":
    case "blind_challenge":
    case "owner_response_ballot":
      return DEPARTMENT_LEADS;
    case "semantic_audit":
      return [];
    case "chair_synthesis":
      return [WORKFLOW_V1_CHAIR_ID];
    default:
      return assertNever(stage);
  }
}

export function isWorkflowStageOwner(
  stage: AgentOutputStage,
  actorId: WorkflowActorId,
): boolean {
  return workflowStageOwners(stage).some((ownerId) => ownerId === actorId);
}

export function workflowRoleById(roleId: string): WorkflowRole | undefined {
  return WORKFLOW_V1_ROLES.find((role) => role.id === roleId);
}

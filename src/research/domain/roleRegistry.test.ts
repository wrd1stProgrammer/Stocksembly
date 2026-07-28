import { describe, expect, it } from "vitest";
import { OFFICE_SCENE_MANIFEST } from "../officeSceneManifest";
import { WORKFLOW_V1_ROLE_REGISTRY, workflowStageOwners } from "./roleRegistry";
import { requiredArtifactSlotById } from "./roleRegistryArtifacts";

const EXPECTED_ROLES = [
  ["market", "Maya", "market", true],
  ["market_news", "June", "market", false],
  ["benchmark", "Alex", "market", false],
  ["company", "Ethan", "company", true],
  ["company_product", "Aria", "company", false],
  ["company_competition", "Leo", "company", false],
  ["financial", "Noah", "financial", true],
  ["valuation", "Sofia", "financial", false],
  ["financial_quality", "Hana", "financial", false],
  ["risk", "Liam", "risk", true],
  ["risk_policy", "Min", "risk", false],
  ["chair", "Dr. Park", "chair", false],
] as const;

const EXPECTED_DEPARTMENTS = {
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
} as const;

const EXPECTED_EVIDENCE_NEEDS = {
  market: [
    "issuer_identity",
    "sec_primary_filings",
    "sec_company_facts",
    "bls_cpi",
    "bls_unemployment",
    "treasury_yield_curve",
    "capability_posture",
    "question_mandate",
  ],
  market_news: [
    "provider_technical_1h",
    "provider_technical_4h",
    "observed_provider_coverage",
    "capability_posture",
    "question_mandate",
  ],
  benchmark: [
    "provider_peer_context",
    "provider_fundamentals",
    "provider_technical_1h",
    "provider_technical_4h",
    "treasury_yield_curve",
    "observed_provider_coverage",
    "capability_posture",
    "question_mandate",
  ],
  company: [
    "issuer_identity",
    "sec_primary_filings",
    "sec_current_reports",
    "sec_amendment_lineage",
    "categorized_news_events",
    "question_mandate",
  ],
  company_product: [
    "sec_primary_filings",
    "sec_current_reports",
    "categorized_news_events",
    "question_mandate",
  ],
  company_competition: [
    "sec_primary_filings",
    "sec_current_reports",
    "capability_posture",
    "question_mandate",
  ],
  financial: [
    "sec_primary_filings",
    "sec_company_facts",
    "sec_amendment_lineage",
    "question_mandate",
  ],
  valuation: [
    "sec_company_facts",
    "sec_primary_filings",
    "provider_fundamentals",
    "observed_provider_coverage",
    "capability_posture",
    "question_mandate",
  ],
  financial_quality: [
    "sec_primary_filings",
    "sec_company_facts",
    "sec_amendment_lineage",
    "question_mandate",
  ],
  risk: [
    "sec_primary_filings",
    "sec_current_reports",
    "sec_amendment_lineage",
    "bls_cpi",
    "bls_unemployment",
    "treasury_yield_curve",
    "categorized_news_events",
    "question_mandate",
  ],
  risk_policy: [
    "sec_primary_filings",
    "sec_current_reports",
    "bls_cpi",
    "bls_unemployment",
    "treasury_yield_curve",
    "question_mandate",
  ],
  chair: [
    "accepted_agent_artifacts",
    "audited_claim_register",
    "department_ballots",
    "capability_posture",
    "question_mandate",
  ],
} as const;

describe("WorkflowV1 role registry", () => {
  it("matches the exact visual roster and department leadership", () => {
    // Given
    const visualRoles = OFFICE_SCENE_MANIFEST.roster.map((role) => [
      role.id,
      role.name.en,
      role.departmentId,
      role.representative,
    ]);
    // When
    const domainRoles = WORKFLOW_V1_ROLE_REGISTRY.roles.map((role) => [
      role.id,
      role.name,
      role.departmentId,
      role.isDepartmentLead,
    ]);
    // Then
    expect(WORKFLOW_V1_ROLE_REGISTRY.version).toBe("WorkflowV1");
    expect(visualRoles).toEqual(EXPECTED_ROLES);
    expect(domainRoles).toEqual(EXPECTED_ROLES);
    expect(WORKFLOW_V1_ROLE_REGISTRY.departments).toEqual(EXPECTED_DEPARTMENTS);
  });

  it("locks independently specified evidence needs for every role", () => {
    // Given
    const expected = EXPECTED_EVIDENCE_NEEDS;
    // When
    const actual = Object.fromEntries(
      WORKFLOW_V1_ROLE_REGISTRY.roles.map((role) => [
        role.id,
        role.evidenceNeeds,
      ]),
    );
    // Then
    expect(actual).toEqual(expected);
  });

  it("assigns each model-authored stage only to its allowed owners", () => {
    // Given
    const expected = {
      memo: EXPECTED_ROLES.slice(0, 11).map(([id]) => id),
      department_consolidation: ["market", "company", "financial", "risk"],
      blind_challenge: ["market", "company", "financial", "risk"],
      owner_response_ballot: ["market", "company", "financial", "risk"],
      follow_up: EXPECTED_ROLES.slice(0, 11).map(([id]) => id),
      semantic_audit: [],
      chair_synthesis: ["chair"],
    } as const;
    // When
    const actual = Object.fromEntries(
      Object.keys(expected).map((stage) => [stage, workflowStageOwners(stage)]),
    );
    // Then
    expect(actual).toEqual(expected);
    expect(workflowStageOwners("chair_synthesis")).not.toContain("market");
    expect(workflowStageOwners("memo")).not.toContain("chair");
    expect(requiredArtifactSlotById("semantic_audit:system")).toMatchObject({
      ownerId: "system",
      departmentId: null,
    });
    expect(
      WORKFLOW_V1_ROLE_REGISTRY.roles.map((role) => role.id),
    ).not.toContain("system");
  });
});

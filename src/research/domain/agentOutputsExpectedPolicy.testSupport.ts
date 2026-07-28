export const EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS = [
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
  {
    logicalArtifactId: "consolidation:market",
    stage: "department_consolidation",
    ownerId: "market",
    departmentId: "market",
  },
  {
    logicalArtifactId: "consolidation:company",
    stage: "department_consolidation",
    ownerId: "company",
    departmentId: "company",
  },
  {
    logicalArtifactId: "consolidation:financial",
    stage: "department_consolidation",
    ownerId: "financial",
    departmentId: "financial",
  },
  {
    logicalArtifactId: "consolidation:risk",
    stage: "department_consolidation",
    ownerId: "risk",
    departmentId: "risk",
  },
  {
    logicalArtifactId: "challenge:market",
    stage: "blind_challenge",
    ownerId: "market",
    departmentId: "market",
  },
  {
    logicalArtifactId: "challenge:company",
    stage: "blind_challenge",
    ownerId: "company",
    departmentId: "company",
  },
  {
    logicalArtifactId: "challenge:financial",
    stage: "blind_challenge",
    ownerId: "financial",
    departmentId: "financial",
  },
  {
    logicalArtifactId: "challenge:risk",
    stage: "blind_challenge",
    ownerId: "risk",
    departmentId: "risk",
  },
  {
    logicalArtifactId: "response_ballot:market",
    stage: "owner_response_ballot",
    ownerId: "market",
    departmentId: "market",
  },
  {
    logicalArtifactId: "response_ballot:company",
    stage: "owner_response_ballot",
    ownerId: "company",
    departmentId: "company",
  },
  {
    logicalArtifactId: "response_ballot:financial",
    stage: "owner_response_ballot",
    ownerId: "financial",
    departmentId: "financial",
  },
  {
    logicalArtifactId: "response_ballot:risk",
    stage: "owner_response_ballot",
    ownerId: "risk",
    departmentId: "risk",
  },
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
] as const;

export type ExpectedWorkflowV1Artifact =
  (typeof EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS)[number];
export type ExpectedWorkflowV1Stage = ExpectedWorkflowV1Artifact["stage"];

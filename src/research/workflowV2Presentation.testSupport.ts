import { WorkflowV2ResearchReportSchema } from "./domain/report";
import { reportTestIds, validReport } from "./domain/report.testSupport";
import {
  WORKFLOW_V1_ROLE_REGISTRY,
  type WorkflowDepartmentId,
} from "./domain/roleRegistry";

export const workflowV2PresentationMetricId =
  "00000000-0000-4000-8000-000000000097";
const secondClaimId = "00000000-0000-4000-8000-000000000098";

export function workflowV2PresentationFixture() {
  const legacy = validReport();
  const claims = [
    {
      claimId: reportTestIds.claim,
      decisionDimension: "growth_engine",
      roleOwner: "company",
      stanceContribution: "supports",
      materiality: "material",
      publicThesis: {
        en: "Persisted company thesis.",
        ko: "저장된 기업 논지입니다.",
      },
      evidenceArtifactIds: [reportTestIds.source],
      counterevidenceArtifactIds: [],
      decisiveMetricIds: [workflowV2PresentationMetricId],
      falsifier: {
        en: "Company-specific falsifier.",
        ko: "기업 주장 전용 반증 조건입니다.",
      },
    },
    {
      claimId: secondClaimId,
      decisionDimension: "downside_path",
      roleOwner: "risk",
      stanceContribution: "opposes",
      materiality: "material",
      publicThesis: {
        en: "Persisted risk thesis.",
        ko: "저장된 위험 논지입니다.",
      },
      evidenceArtifactIds: [reportTestIds.source],
      counterevidenceArtifactIds: [reportTestIds.source],
      decisiveMetricIds: [],
      falsifier: {
        en: "Risk-specific falsifier.",
        ko: "위험 주장 전용 반증 조건입니다.",
      },
    },
  ] as const;
  return WorkflowV2ResearchReportSchema.parse({
    ...legacy,
    schemaVersion: "workflow-v2",
    claims: [
      {
        ...legacy.claims[0],
        text: claims[0].publicThesis,
        disposition: "accepted",
        adjudicationReason: {
          en: "Accepted for the published decision.",
          ko: "공개 판단 근거로 채택했습니다.",
        },
      },
      {
        ...legacy.claims[0],
        claimId: secondClaimId,
        text: claims[1].publicThesis,
        disposition: "accepted",
        adjudicationReason: {
          en: "Accepted as the published countercase.",
          ko: "공개 반대 논거로 채택했습니다.",
        },
      },
    ],
    editorialClaims: claims,
    editorialDecision: {
      stance: "wait_for_proof",
      confidence: "medium",
      decisiveReason: {
        en: "Persisted decisive reason.",
        ko: "저장된 최종 판단 이유입니다.",
      },
      strongestCountercase: {
        en: "Persisted strongest countercase.",
        ko: "저장된 최강 반대 논거입니다.",
      },
      falsifier: {
        en: "Decision-level falsifier.",
        ko: "최종 판단 전용 반증 조건입니다.",
      },
      primaryClaimIds: [reportTestIds.claim, secondClaimId],
    },
    comparators: [
      {
        comparatorId: "qualified-peer",
        role: "operating_comparable",
        rationale: {
          en: "Persisted comparator rationale.",
          ko: "저장된 비교기업 선정 근거입니다.",
        },
        comparableMetricKeys: ["operating_margin"],
      },
    ],
    anticipatedQuestions: Array.from({ length: 10 }, (_, index) => ({
      questionId: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
      decisionKey: `persisted_question_${index + 1}`,
      question: {
        en: `Persisted question ${index + 1}?`,
        ko: `저장된 질문 ${index + 1}은 무엇인가요?`,
      },
      answer: {
        en: `Persisted answer ${index + 1}.`,
        ko: `저장된 답변 ${index + 1}입니다.`,
      },
      primaryClaimIds: [index % 2 === 0 ? reportTestIds.claim : secondClaimId],
      evidenceArtifactIds: [reportTestIds.source],
      rank: 10 - index,
    })),
  });
}

export function departmentWorkflowV2PresentationFixture(
  departmentId: WorkflowDepartmentId,
) {
  const report = workflowV2PresentationFixture();
  const department = WORKFLOW_V1_ROLE_REGISTRY.departments[departmentId];
  const primary = report.editorialClaims[0];
  const registered = report.claims[0];
  const teamView = report.teamViews.find(
    (view) => view.departmentId === departmentId,
  );
  if (
    primary === undefined ||
    registered === undefined ||
    teamView === undefined
  )
    throw new TypeError("workflow-v2 fixture is incomplete");
  const ownedClaim = {
    ...primary,
    roleOwner: departmentId,
    decisionDimension:
      departmentId === "market"
        ? ("regime" as const)
        : departmentId === "company"
          ? ("growth_engine" as const)
          : departmentId === "financial"
            ? ("cash_conversion" as const)
            : ("downside_path" as const),
    publicThesis: {
      en: `Persisted ${departmentId} thesis.`,
      ko: `저장된 ${departmentId} 논지입니다.`,
    },
    falsifier: {
      en: `Persisted ${departmentId} falsifier.`,
      ko: `저장된 ${departmentId} 반증 조건입니다.`,
    },
  };
  const memberIds = new Set<string>(department.memberIds);
  const legacyArtifacts = validReport().artifacts.filter((artifact) =>
    memberIds.has(artifact.roleId),
  );
  return WorkflowV2ResearchReportSchema.parse({
    ...report,
    researchTarget: { kind: "department", departmentId },
    teamViews: [teamView],
    artifacts: [
      ...legacyArtifacts,
      {
        artifactId: "00000000-0000-4000-8000-000000000096",
        logicalArtifactId: `consolidation:${departmentId}`,
        roleId: department.leadId,
        stage: "department_consolidation",
        status: "accepted",
        runId: report.runId,
        snapshotId: report.snapshotId,
      },
    ],
    claims: [{ ...registered, text: ownedClaim.publicThesis }],
    editorialClaims: [ownedClaim],
    editorialDecision: {
      ...report.editorialDecision,
      decisiveReason: {
        en: `Persisted ${departmentId} decision.`,
        ko: `저장된 ${departmentId} 판단입니다.`,
      },
      primaryClaimIds: [ownedClaim.claimId],
    },
    comparators: report.comparators.map((comparator) => ({
      ...comparator,
      comparatorId: `${departmentId}-peer`,
    })),
    anticipatedQuestions: report.anticipatedQuestions.map((question) => ({
      ...question,
      primaryClaimIds: [ownedClaim.claimId],
    })),
  });
}

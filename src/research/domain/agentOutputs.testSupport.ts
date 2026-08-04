import type {
  ExpectedWorkflowV1Artifact,
  ExpectedWorkflowV1Stage,
} from "./agentOutputsExpectedPolicy.testSupport";
import { assertNever } from "./ids";

type CandidateStage = ExpectedWorkflowV1Stage | "follow_up";

export const TEST_RUN_ID = "00000000-0000-4000-8000-000000000101";
export const TEST_SNAPSHOT_ID = "00000000-0000-4000-8000-000000000102";

export function testUuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function sourceArtifactId(index: number): string {
  return testUuid(1_000 + index);
}

function sourceArtifactIdsFor(
  stage: CandidateStage,
  index: number,
): readonly string[] {
  if (stage !== "chair_synthesis") return [sourceArtifactId(index)];
  return [0, 100, 200, 300].map((offset) => sourceArtifactId(index + offset));
}

function text(index: number): { readonly en: string; readonly ko: string } {
  return { en: `Public finding ${index}`, ko: `공개 결과 ${index}` };
}

export function candidateForStage(
  stage: CandidateStage,
  index: number,
): Readonly<Record<string, unknown>> {
  const claimId = testUuid(2_000 + index);
  const sourceArtifactIds = sourceArtifactIdsFor(stage, index);
  switch (stage) {
    case "memo":
      return {
        kind: "memo",
        sourceArtifactIds,
        positions: [
          {
            claimId,
            stance: "supports",
            publicSummary: text(index),
            evidenceArtifactIds: sourceArtifactIds,
          },
        ],
        dissent: [{ claimId, publicSummary: text(index + 1) }],
        unknowns: [text(index + 2)],
      };
    case "department_consolidation":
      return {
        kind: "department_consolidation",
        sourceArtifactIds,
        agreementClaimIds: [claimId],
        disagreementClaimIds: [claimId],
        acceptedClaimIds: [claimId],
        strongestClaimIds: [claimId],
        weakestClaimIds: [claimId],
        revisedClaimIds: [],
        removedClaimIds: [],
        dispositions: [
          {
            claimId,
            disposition: "accept",
            reason: text(index + 3),
          },
        ],
        revisions: [],
        publicSummary: text(index),
        dissent: [{ claimId, publicSummary: text(index + 1) }],
        openQuestions: [text(index + 2)],
        evidencePriorityArtifactIds: sourceArtifactIds,
      };
    case "blind_challenge":
      return {
        kind: "blind_challenge",
        sourceArtifactIds,
        challengedClaimIds: [claimId],
        publicChallenge: text(index),
        evidenceArtifactIds: sourceArtifactIds,
        contradiction: "partial",
        materiality: "material",
        followupRequest: {
          targetClaimId: claimId,
          kind: "source_scope_clarification",
          evidenceArtifactIds: sourceArtifactIds,
        },
      };
    case "owner_response_ballot":
      return {
        kind: "owner_response_ballot",
        sourceArtifactIds,
        dispositions: [
          {
            claimId,
            disposition: "accept",
            publicRationale: text(index),
          },
        ],
        ballot: {
          vote: "support_with_reservations",
          rationaleClaimIds: [claimId],
          publicRationale: text(index + 1),
        },
        dissent: [{ claimId, publicSummary: text(index + 2) }],
        unresolvedConditions: [text(index + 3)],
      };
    case "follow_up":
      return {
        kind: "follow_up",
        sourceArtifactIds,
        requestId: testUuid(3_000 + index),
        publicAnswer: text(index),
        evidenceArtifactIds: sourceArtifactIds,
        unresolved: [text(index + 1)],
      };
    case "semantic_audit":
      return {
        kind: "semantic_audit",
        sourceArtifactIds,
        verdicts: [
          {
            claimId,
            verdict: "entailed",
            contradictionSeverity: "none",
            evidenceArtifactIds: sourceArtifactIds,
            publicExplanation: text(index),
          },
        ],
        questionCoverage: [
          {
            questionId: testUuid(4_000 + index),
            status: "covered",
            claimIds: [claimId],
          },
        ],
      };
    case "chair_synthesis":
      return {
        kind: "chair_synthesis",
        sourceArtifactIds,
        decisionBrief: {
          stance: "wait_for_proof",
          confidence: "medium",
          decisiveReason: text(index),
          strongestCountercase: text(index + 1),
          falsifier: text(index + 2),
          primaryClaimIds: [claimId],
          primarySentenceIds: [`claim:${claimId}`],
        },
        sections: (
          [
            "ten_second_brief",
            "supported_analysis",
            "valuation_comparison",
            "operational_scenarios",
            "dissent_unknowns",
            "change_conditions",
          ] as const
        ).map((sectionKey, sectionIndex) => {
          const primarySentenceId =
            sectionIndex === 0
              ? `claim:${claimId}`
              : `section:${sectionKey}:${claimId}`;
          return {
            sectionId: sectionKey,
            sectionKey,
            publicSummary: text(index + sectionIndex),
            primarySentenceId,
            sentenceIds: [primarySentenceId],
            sourceArtifactIds,
            auditedClaimIds: [claimId],
          };
        }),
        ballotArtifactIds: sourceArtifactIds,
        dissentClaimIds: [claimId],
        selectedUnknownIds: [testUuid(3_000 + index)],
        unknowns: [text(index + 1)],
      };
    default:
      return assertNever(stage);
  }
}

export function launchInputForSlot(
  slot: ExpectedWorkflowV1Artifact,
  index: number,
): Readonly<Record<string, unknown>> {
  return {
    workflowVersion: "WorkflowV1",
    runId: TEST_RUN_ID,
    snapshotId: TEST_SNAPSHOT_ID,
    jobId: testUuid(5_000 + index),
    attemptId: testUuid(6_000 + index),
    launchOrdinal: index + 1,
    logicalArtifactId: slot.logicalArtifactId,
    artifactId: testUuid(7_000 + index),
    stage: slot.stage,
    actorId: slot.ownerId,
    departmentId: slot.departmentId,
    sourceArtifacts: sourceArtifactIdsFor(slot.stage, index).map(
      (artifactId) => ({
        artifactId,
        runId: TEST_RUN_ID,
        snapshotId: TEST_SNAPSHOT_ID,
      }),
    ),
  };
}

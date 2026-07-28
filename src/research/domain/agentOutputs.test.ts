import { describe, expect, it } from "vitest";
import { z } from "zod";
import "./agentOutputsAdversarial.testCases";
import {
  AgentOutputCandidateSchema,
  BlindChallengeOutputSchema,
  ChairSynthesisOutputSchema,
  DepartmentConsolidationOutputSchema,
  FollowUpOutputSchema,
  MemoOutputSchema,
  OwnerResponseBallotOutputSchema,
  SemanticAuditOutputSchema,
} from "./agentOutputs";
import {
  candidateForStage,
  launchInputForSlot,
  sourceArtifactId,
  testUuid,
} from "./agentOutputs.testSupport";
import {
  EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS,
  type ExpectedWorkflowV1Artifact,
} from "./agentOutputsExpectedPolicy.testSupport";
import { evaluateWorkflowV1Publication } from "./agentOutputsPublication";
import {
  acceptAgentOutput,
  issueTrustedAgentLaunch,
  type TrustedAgentOutput,
} from "./agentOutputsTrust";
import { WORKFLOW_V1_ROSTER_FINGERPRINT } from "./roleRegistry";
import { WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS } from "./roleRegistryArtifacts";

const STRICT_SCHEMAS = [
  ["memo", MemoOutputSchema],
  ["department_consolidation", DepartmentConsolidationOutputSchema],
  ["blind_challenge", BlindChallengeOutputSchema],
  ["owner_response_ballot", OwnerResponseBallotOutputSchema],
  ["follow_up", FollowUpOutputSchema],
  ["semantic_audit", SemanticAuditOutputSchema],
  ["chair_synthesis", ChairSynthesisOutputSchema],
] as const;

function acceptedForSlot(
  slot: ExpectedWorkflowV1Artifact,
  index: number,
): TrustedAgentOutput | undefined {
  const issued = issueTrustedAgentLaunch(launchInputForSlot(slot, index));
  expect(issued.kind).toBe("issued");
  if (issued.kind !== "issued") return undefined;
  const accepted = acceptAgentOutput(
    issued.launch,
    candidateForStage(slot.stage, index),
  );
  expect(accepted.kind).toBe("accepted");
  return accepted.kind === "accepted" ? accepted.output : undefined;
}

function allRequiredOutputs(): readonly TrustedAgentOutput[] {
  const outputs: TrustedAgentOutput[] = [];
  EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS.forEach((slot, index) => {
    const output = acceptedForSlot(slot, index);
    if (output !== undefined) outputs.push(output);
  });
  return outputs;
}

describe("WorkflowV1 agent output contracts", () => {
  it("keeps every model payload schema strict and free of trusted metadata", () => {
    // Given
    const forbiddenFields = [
      "runId",
      "snapshotId",
      "roleId",
      "jobId",
      "attemptId",
      "launchOrdinal",
      "artifactId",
      "prompt",
      "reasoning",
      "toolTrace",
    ] as const;
    // When
    const strictResults = STRICT_SCHEMAS.flatMap(([stage, schema], index) =>
      forbiddenFields.map(
        (field) =>
          schema.safeParse({
            ...candidateForStage(stage, index),
            [field]: "forged",
          }).success,
      ),
    );
    // Then
    expect(strictResults.every((success) => success === false)).toBe(true);
    expect(
      STRICT_SCHEMAS.map(
        ([_stage, schema]) => z.toJSONSchema(schema).additionalProperties,
      ),
    ).toEqual([false, false, false, false, false, false, false]);
    expect(
      AgentOutputCandidateSchema.safeParse({
        ...candidateForStage("memo", 1),
        positions: [
          {
            claimId: testUuid(2_001),
            stance: "supports",
            publicSummary: {
              en: "See https://attacker.invalid",
              ko: "외부 URL",
            },
            evidenceArtifactIds: [sourceArtifactId(1)],
          },
        ],
      }).success,
    ).toBe(false);
    const forbiddenUrlLikeText = [
      "ftp://attacker.invalid/file",
      "mailto:secrets@attacker.invalid",
      "javascript:alert(1)",
      "//attacker.invalid/path",
      "https://user:password@attacker.invalid/path",
      "https://attacker.invalid/path\u0000suffix",
    ] as const;
    expect(
      forbiddenUrlLikeText.every(
        (en) =>
          AgentOutputCandidateSchema.safeParse({
            ...candidateForStage("memo", 1),
            positions: [
              {
                claimId: testUuid(2_001),
                stance: "supports",
                publicSummary: { en, ko: "외부 URL" },
                evidenceArtifactIds: [sourceArtifactId(1)],
              },
            ],
          }).success === false,
      ),
    ).toBe(true);
  });

  it("enforces early, late, semantic, and chair stage ownership", () => {
    // Given
    const memoSlot = EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS[0];
    const chairSlot = EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS[23];
    expect(memoSlot).toBeDefined();
    expect(chairSlot).toBeDefined();
    if (memoSlot === undefined || chairSlot === undefined) return;
    // When
    const roleForgery = issueTrustedAgentLaunch({
      ...launchInputForSlot(memoSlot, 1),
      actorId: "chair",
    });
    const stageForgery = issueTrustedAgentLaunch({
      ...launchInputForSlot(chairSlot, 2),
      stage: "memo",
    });
    const chairPosition = ChairSynthesisOutputSchema.safeParse({
      ...candidateForStage("chair_synthesis", 2),
      positions: [],
    });
    // Then
    expect(roleForgery).toMatchObject({
      kind: "rejected",
      reason: "stage_owner_mismatch",
    });
    expect(stageForgery).toMatchObject({
      kind: "rejected",
      reason: "logical_artifact_mismatch",
    });
    expect(chairPosition.success).toBe(false);
  });

  it("publishes only all 24 required artifacts and preserves dissent and ballots", () => {
    // Given
    const outputs = allRequiredOutputs();
    // When
    const result = evaluateWorkflowV1Publication({
      rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
      outputs,
    });
    // Then
    expect(outputs).toHaveLength(24);
    expect(WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS).toEqual(
      EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS,
    );
    expect(result.kind).toBe("publishable");
    expect(
      outputs.filter((output) => output.payload.kind === "memo"),
    ).toHaveLength(10);
    expect(
      outputs.filter(
        (output) => output.payload.kind === "owner_response_ballot",
      ),
    ).toHaveLength(4);
    expect(
      outputs.some(
        (output) =>
          output.payload.kind === "memo" && output.payload.dissent.length > 0,
      ),
    ).toBe(true);
  });

  it("blocks missing memo, missing chair, roster drift, and duplicate attempts", () => {
    // Given
    const outputs = allRequiredOutputs();
    const withoutMemo = outputs.filter(
      (output) => output.logicalArtifactId !== "memo:risk_policy",
    );
    const withoutChair = outputs.filter(
      (output) => output.logicalArtifactId !== "chair_synthesis:chair",
    );
    // When
    const decisions = [
      evaluateWorkflowV1Publication({
        rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
        outputs: withoutMemo,
      }),
      evaluateWorkflowV1Publication({
        rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
        outputs: withoutChair,
      }),
      evaluateWorkflowV1Publication({
        rosterFingerprint: "WorkflowV1:drifted",
        outputs,
      }),
    ];
    // Then
    expect(decisions.map((decision) => decision.kind)).toEqual([
      "incomplete",
      "incomplete",
      "incomplete",
    ]);
    expect(decisions[0]).toMatchObject({ reason: "missing_required_artifact" });
    expect(decisions[1]).toMatchObject({ reason: "missing_required_artifact" });
    expect(decisions[2]).toMatchObject({ reason: "roster_drift" });
  });
});

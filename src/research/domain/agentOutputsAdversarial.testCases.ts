import { describe, expect, it } from "vitest";
import {
  candidateForStage,
  launchInputForSlot,
  sourceArtifactId,
  TEST_RUN_ID,
  TEST_SNAPSHOT_ID,
  testUuid,
} from "./agentOutputs.testSupport";
import { EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS } from "./agentOutputsExpectedPolicy.testSupport";
import { evaluateWorkflowV1Publication } from "./agentOutputsPublication";
import {
  acceptAgentOutput,
  issueTrustedAgentLaunch,
  type TrustedAgentOutput,
} from "./agentOutputsTrust";
import { WORKFLOW_V1_ROSTER_FINGERPRINT } from "./roleRegistry";

describe("WorkflowV1 trusted output adversaries", () => {
  it("prevents plain JSON and model payloads from minting trusted envelopes", () => {
    // Given
    const slot = EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS[0];
    expect(slot).toBeDefined();
    if (slot === undefined) return;
    const issued = issueTrustedAgentLaunch(launchInputForSlot(slot, 3));
    expect(issued.kind).toBe("issued");
    if (issued.kind !== "issued") return;
    const forgedLaunch = { ...issued.launch };
    // When
    const plainJson = acceptAgentOutput(
      forgedLaunch,
      candidateForStage("memo", 3),
    );
    const modelAttempt = acceptAgentOutput(issued.launch, {
      ...candidateForStage("memo", 3),
      attemptId: testUuid(999),
    });
    // Then
    expect(plainJson).toMatchObject({
      kind: "rejected",
      reason: "untrusted_launch",
    });
    expect(modelAttempt).toMatchObject({
      kind: "rejected",
      reason: "invalid_payload",
    });
  });

  it("rejects cross-run and cross-snapshot artifact lineage", () => {
    // Given
    const slot = EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS[0];
    expect(slot).toBeDefined();
    if (slot === undefined) return;
    const base = launchInputForSlot(slot, 4);
    // When
    const crossRun = issueTrustedAgentLaunch({
      ...base,
      sourceArtifacts: [
        {
          artifactId: sourceArtifactId(4),
          runId: testUuid(909),
          snapshotId: TEST_SNAPSHOT_ID,
        },
      ],
    });
    const crossSnapshot = issueTrustedAgentLaunch({
      ...base,
      sourceArtifacts: [
        {
          artifactId: sourceArtifactId(4),
          runId: TEST_RUN_ID,
          snapshotId: testUuid(910),
        },
      ],
    });
    // Then
    expect(crossRun).toMatchObject({
      kind: "rejected",
      reason: "cross_run_lineage",
    });
    expect(crossSnapshot).toMatchObject({
      kind: "rejected",
      reason: "cross_snapshot_lineage",
    });
  });

  it("blocks two accepted artifacts that claim the same trusted attempt", () => {
    // Given
    const slots = EXPECTED_WORKFLOW_V1_REQUIRED_ARTIFACTS.slice(0, 2);
    const outputs: TrustedAgentOutput[] = [];
    // When
    slots.forEach((slot, index) => {
      const issued = issueTrustedAgentLaunch({
        ...launchInputForSlot(slot, index + 20),
        attemptId: testUuid(8_888),
      });
      expect(issued.kind).toBe("issued");
      if (issued.kind !== "issued") return;
      const accepted = acceptAgentOutput(
        issued.launch,
        candidateForStage(slot.stage, index + 20),
      );
      expect(accepted.kind).toBe("accepted");
      if (accepted.kind === "accepted") outputs.push(accepted.output);
    });
    const decision = evaluateWorkflowV1Publication({
      rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
      outputs,
    });
    // Then
    expect(decision).toMatchObject({
      kind: "incomplete",
      reason: "duplicate_attempt",
    });
  });
});

import {
  isTrustedAgentOutput,
  type TrustedAgentOutput,
} from "./agentOutputsTrust";
import { WORKFLOW_V1_ROSTER_FINGERPRINT } from "./roleRegistry";
import {
  isArtifactStageOwner,
  requiredArtifactSlotById,
  WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS,
} from "./roleRegistryArtifacts";

export type PublicationDecision =
  | {
      readonly kind: "publishable";
      readonly artifacts: readonly TrustedAgentOutput[];
    }
  | {
      readonly kind: "incomplete";
      readonly reason:
        | "cross_run_artifact"
        | "cross_snapshot_artifact"
        | "duplicate_artifact"
        | "duplicate_attempt"
        | "duplicate_job"
        | "duplicate_logical_artifact"
        | "duplicate_ordinal"
        | "invalid_stage_owner"
        | "missing_required_artifact"
        | "roster_drift"
        | "untrusted_artifact";
      readonly missingLogicalArtifactIds?: readonly string[];
    };

type PublicationInput = {
  readonly rosterFingerprint: string;
  readonly outputs: readonly unknown[];
};

export function evaluateWorkflowV1Publication(
  input: PublicationInput,
): PublicationDecision {
  if (input.rosterFingerprint !== WORKFLOW_V1_ROSTER_FINGERPRINT)
    return { kind: "incomplete", reason: "roster_drift" };
  if (!input.outputs.every(isTrustedAgentOutput))
    return { kind: "incomplete", reason: "untrusted_artifact" };
  const outputs = input.outputs;
  const first = outputs[0];
  if (first === undefined)
    return {
      kind: "incomplete",
      reason: "missing_required_artifact",
      missingLogicalArtifactIds: WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.map(
        (slot) => slot.logicalArtifactId,
      ),
    };

  const artifactIds = new Set<string>();
  const attemptIds = new Set<string>();
  const jobIds = new Set<string>();
  const ordinals = new Set<number>();
  const logicalArtifactIds = new Set<string>();
  for (const output of outputs) {
    if (output.runId !== first.runId)
      return { kind: "incomplete", reason: "cross_run_artifact" };
    if (output.snapshotId !== first.snapshotId)
      return { kind: "incomplete", reason: "cross_snapshot_artifact" };
    if (artifactIds.has(output.artifactId))
      return { kind: "incomplete", reason: "duplicate_artifact" };
    if (attemptIds.has(output.attemptId))
      return { kind: "incomplete", reason: "duplicate_attempt" };
    if (jobIds.has(output.jobId))
      return { kind: "incomplete", reason: "duplicate_job" };
    if (ordinals.has(output.launchOrdinal))
      return { kind: "incomplete", reason: "duplicate_ordinal" };
    if (logicalArtifactIds.has(output.logicalArtifactId))
      return { kind: "incomplete", reason: "duplicate_logical_artifact" };
    if (!isArtifactStageOwner(output.stage, output.actorId))
      return { kind: "incomplete", reason: "invalid_stage_owner" };
    const slot = requiredArtifactSlotById(output.logicalArtifactId);
    if (
      output.stage !== "follow_up" &&
      (slot === undefined ||
        slot.stage !== output.stage ||
        slot.ownerId !== output.actorId)
    )
      return { kind: "incomplete", reason: "invalid_stage_owner" };
    artifactIds.add(output.artifactId);
    attemptIds.add(output.attemptId);
    jobIds.add(output.jobId);
    ordinals.add(output.launchOrdinal);
    logicalArtifactIds.add(output.logicalArtifactId);
  }

  const missingLogicalArtifactIds = WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.filter(
    (slot) => !logicalArtifactIds.has(slot.logicalArtifactId),
  ).map((slot) => slot.logicalArtifactId);
  if (missingLogicalArtifactIds.length > 0)
    return {
      kind: "incomplete",
      reason: "missing_required_artifact",
      missingLogicalArtifactIds,
    };
  return { kind: "publishable", artifacts: outputs };
}

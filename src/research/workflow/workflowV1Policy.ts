import {
  requiredArtifactSlotById,
  WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS,
} from "../domain/roleRegistryArtifacts";
import type {
  WorkflowV1ArtifactEventKind,
  WorkflowV1Phase,
  WorkflowV1SystemEventKind,
} from "./workflowV1Contracts";

export const REQUIRED_GROUPS = [
  WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.filter((slot) => slot.stage === "memo"),
  WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.filter(
    (slot) => slot.stage === "department_consolidation",
  ),
  WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.filter(
    (slot) => slot.stage === "blind_challenge",
  ),
  WORKFLOW_V1_REQUIRED_ARTIFACT_SLOTS.filter(
    (slot) => slot.stage === "owner_response_ballot",
  ),
] as const;

export const EVENT_KINDS = {
  memo: ["specialist_memo_committed"],
  department_consolidation: ["department_consolidation_committed"],
  blind_challenge: ["challenge_committed"],
  follow_up: ["followup_committed"],
  owner_response_ballot: ["owner_response_committed"],
  semantic_audit: ["semantic_audit_committed"],
  chair_synthesis: ["chair_synthesis_committed"],
} as const satisfies Readonly<
  Record<string, readonly WorkflowV1ArtifactEventKind[]>
>;

export function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function phaseFor(
  milestones: ReadonlySet<WorkflowV1SystemEventKind>,
  collectionCompleted: boolean,
  accepted: ReadonlySet<string>,
  terminal: WorkflowV1Phase | null,
): WorkflowV1Phase {
  if (terminal !== null) return terminal;
  if (accepted.has("chair_synthesis:chair")) return "publishing";
  if (milestones.has("committee_classified")) return "chair_synthesis";
  if (milestones.has("gathering_started")) return "committee";
  if (accepted.has("semantic_audit:system")) return "committee";
  if (milestones.has("structural_audit_completed")) return "semantic_audit";
  if (REQUIRED_GROUPS[3].every((slot) => accepted.has(slot.logicalArtifactId)))
    return "structural_audit";
  if (REQUIRED_GROUPS[2].every((slot) => accepted.has(slot.logicalArtifactId)))
    return "response_round";
  if (REQUIRED_GROUPS[1].every((slot) => accepted.has(slot.logicalArtifactId)))
    return "challenge_round";
  if (REQUIRED_GROUPS[0].every((slot) => accepted.has(slot.logicalArtifactId)))
    return "department_round";
  if (milestones.has("mandate_sealed")) return "specialist_round";
  if (milestones.has("snapshot_sealed")) return "snapshot_sealed";
  if (milestones.has("evidence_cutoff_recorded")) return "cutoff_recorded";
  if (collectionCompleted) return "collection_closed";
  if (milestones.has("collection_started")) return "collecting";
  return milestones.has("run_created") ? "created" : "new";
}

export function expectedSystemEvent(
  milestones: ReadonlySet<WorkflowV1SystemEventKind>,
  collectionCompleted: boolean,
  accepted: ReadonlySet<string>,
  projectedBallots: ReadonlySet<string>,
): WorkflowV1SystemEventKind | null {
  if (!milestones.has("run_created")) return "run_created";
  if (!milestones.has("collection_started")) return "collection_started";
  if (!collectionCompleted) return null;
  if (!milestones.has("evidence_cutoff_recorded"))
    return "evidence_cutoff_recorded";
  if (!milestones.has("snapshot_sealed")) return "snapshot_sealed";
  if (!milestones.has("mandate_sealed")) return "mandate_sealed";
  if (
    REQUIRED_GROUPS[3].every((slot) => accepted.has(slot.logicalArtifactId)) &&
    !milestones.has("structural_audit_completed")
  )
    return "structural_audit_completed";
  if (
    accepted.has("semantic_audit:system") &&
    !milestones.has("gathering_started")
  )
    return "gathering_started";
  if (
    milestones.has("gathering_started") &&
    projectedBallots.size === 4 &&
    !milestones.has("committee_classified")
  )
    return "committee_classified";
  return null;
}

export function missingRequiredGroup(
  accepted: ReadonlySet<string>,
): readonly string[] {
  for (const group of REQUIRED_GROUPS) {
    const missing = group
      .map((slot) => slot.logicalArtifactId)
      .filter((id) => !accepted.has(id));
    if (missing.length > 0) return missing;
  }
  return [];
}

function missing(
  accepted: ReadonlySet<string>,
  pending: ReadonlySet<string>,
  group: readonly { readonly logicalArtifactId: string }[],
): readonly string[] {
  return group
    .map((slot) => slot.logicalArtifactId)
    .filter((id) => !accepted.has(id) && !pending.has(id));
}

export function allowedWorkflowLaunches(input: {
  readonly accepted: ReadonlySet<string>;
  readonly failed: ReadonlyMap<string, number>;
  readonly followups: readonly string[] | null;
  readonly milestones: ReadonlySet<WorkflowV1SystemEventKind>;
  readonly pending: ReadonlySet<string>;
}): readonly string[] {
  for (const [id] of [...input.failed].reverse())
    if (
      !input.accepted.has(id) &&
      requiredArtifactSlotById(id)?.stage !== "follow_up"
    )
      return input.pending.has(id) ? [] : [id];
  for (const group of REQUIRED_GROUPS.slice(0, 3)) {
    const ids = missing(input.accepted, input.pending, group);
    if (ids.length > 0) return ids;
  }
  if (input.followups === null) return [];
  const followups = input.followups.filter(
    (id) =>
      !input.accepted.has(id) &&
      !input.failed.has(id) &&
      !input.pending.has(id),
  );
  if (followups.length > 0) return followups;
  const responses = missing(input.accepted, input.pending, REQUIRED_GROUPS[3]);
  if (responses.length > 0) return responses;
  if (!input.milestones.has("structural_audit_completed")) return [];
  if (!input.accepted.has("semantic_audit:system"))
    return input.pending.has("semantic_audit:system")
      ? []
      : ["semantic_audit:system"];
  if (
    input.milestones.has("committee_classified") &&
    !input.accepted.has("chair_synthesis:chair")
  )
    return input.pending.has("chair_synthesis:chair")
      ? []
      : ["chair_synthesis:chair"];
  return [];
}

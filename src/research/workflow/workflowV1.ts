import {
  CALL_BUDGET_POLICY,
  type LaunchPurpose,
} from "../domain/callBudgetContracts";
import { requiredArtifactSlotById } from "../domain/roleRegistryArtifacts";
import type {
  WorkflowV1LedgerEntry,
  WorkflowV1NextAction,
  WorkflowV1State,
  WorkflowV1ValidState,
} from "./workflowV1Contracts";

export { WORKFLOW_V1_MAX_ACCEPTED_SOURCES } from "./workflowV1Contracts";

import { expectedSystemEvent, REQUIRED_GROUPS } from "./workflowV1Policy";
import { replayWorkflowV1 } from "./workflowV1Replay";

export type {
  WorkflowV1ArtifactEventKind,
  WorkflowV1InvalidReason,
  WorkflowV1LedgerEntry,
  WorkflowV1NextAction,
  WorkflowV1Phase,
  WorkflowV1State,
  WorkflowV1SystemEventKind,
  WorkflowV1ValidState,
} from "./workflowV1Contracts";

export function deriveWorkflowV1State(
  entries: readonly WorkflowV1LedgerEntry[],
): WorkflowV1State {
  const result = replayWorkflowV1(entries);
  return "state" in result ? result.state : result;
}

export function nextWorkflowV1Action(
  entries: readonly WorkflowV1LedgerEntry[],
): WorkflowV1NextAction {
  const result = replayWorkflowV1(entries);
  if (!("state" in result))
    return { kind: "invalid_ledger", reason: result.reason };
  const { state, milestones, collectionCompleted } = result;
  if (state.terminal) return { kind: "none" };
  const pending = state.pendingReservations[0];
  if (pending !== undefined)
    return {
      kind: "record_reserved_launch_failure",
      logicalArtifactId: pending.logicalArtifactId,
      ordinal: pending.ordinal,
      outcome: state.cancellationRequested ? "cancelled_race" : "uncertain",
    };
  if (state.cancellationRequested) return { kind: "finalize_cancel" };
  if (state.failureRequestedReason !== null)
    return {
      kind: "finalize_failure",
      reason: state.failureRequestedReason,
    };
  const expected = expectedSystemEvent(
    milestones,
    collectionCompleted,
    new Set(state.acceptedLogicalArtifactIds),
    new Set(state.projectedBallotArtifactIds),
  );
  if (expected !== null)
    return { kind: "emit_system_event", eventKind: expected };
  if (state.phase === "collecting") return { kind: "collect_evidence" };
  const failed = state.failedLogicalArtifactIds.at(-1);
  if (
    failed !== undefined &&
    requiredArtifactSlotById(failed)?.stage !== "follow_up" &&
    !state.acceptedLogicalArtifactIds.includes(failed)
  ) {
    const failureCount = entries.filter(
      (event) =>
        event.type === "launch_finished" && event.logicalArtifactId === failed,
    ).length;
    if (
      failureCount >= CALL_BUDGET_POLICY.maxAttemptsPerLogicalArtifact ||
      state.requiredReplacementCount >=
        CALL_BUDGET_POLICY.maxRequiredReplacements ||
      state.physicalLaunchCount >= CALL_BUDGET_POLICY.maxPhysicalLaunches
    )
      return { kind: "mark_incomplete", reason: "replacement_exhausted" };
    return stage([failed], state, "required_replacement");
  }
  const accepted = new Set(state.acceptedLogicalArtifactIds);
  for (const group of REQUIRED_GROUPS.slice(0, 3)) {
    const missing = group
      .map((slot) => slot.logicalArtifactId)
      .filter((id) => !accepted.has(id));
    if (missing.length > 0) return stage(missing, state, "mandatory_first");
  }
  if (state.followupsPlanned === null) return { kind: "plan_followups" };
  const failedSet = new Set(state.failedLogicalArtifactIds);
  const followups = state.followupsPlanned.filter(
    (id) => !accepted.has(id) && !failedSet.has(id),
  );
  if (followups.length > 0) return stage(followups, state, "optional_followup");
  const responses = REQUIRED_GROUPS[3]
    .map((slot) => slot.logicalArtifactId)
    .filter((id) => !accepted.has(id));
  if (responses.length > 0) return stage(responses, state, "mandatory_first");
  if (state.phase === "structural_audit")
    return { kind: "run_structural_audit" };
  if (state.phase === "semantic_audit")
    return stage(["semantic_audit:system"], state, "mandatory_first");
  if (
    state.phase === "committee" &&
    state.projectedBallotArtifactIds.length < 4
  ) {
    const projected = new Set(
      entries.flatMap((event) =>
        event.type === "ballot_event_projected"
          ? [event.logicalArtifactId]
          : [],
      ),
    );
    return {
      kind: "project_ballots",
      logicalArtifactIds: REQUIRED_GROUPS[3]
        .map((slot) => slot.logicalArtifactId)
        .filter((id) => !projected.has(id)),
    };
  }
  if (state.phase === "chair_synthesis")
    return stage(["chair_synthesis:chair"], state, "mandatory_first");
  if (state.phase === "publishing") return { kind: "publish_report" };
  return { kind: "none" };
}

function stage(
  logicalArtifactIds: readonly string[],
  state: WorkflowV1ValidState,
  purpose: LaunchPurpose,
): WorkflowV1NextAction {
  return {
    kind: "stage_artifacts",
    logicalArtifactIds,
    nextOrdinal: state.physicalLaunchCount + 1,
    purpose,
  };
}

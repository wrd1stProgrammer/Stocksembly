import { CALL_BUDGET_POLICY } from "../domain/callBudgetContracts";
import { requiredArtifactSlotById } from "../domain/roleRegistryArtifacts";
import {
  admitWorkflowSource,
  invalidWorkflowV1State as invalid,
  isAcceptableReportReadiness,
  isMatchingReportPublication,
} from "./workflowV1Boundaries";
import type {
  WorkflowV1LaunchState,
  WorkflowV1LedgerEntry,
  WorkflowV1Phase,
  WorkflowV1Replay,
  WorkflowV1ReportReadyEntry,
  WorkflowV1State,
  WorkflowV1SystemEventKind,
} from "./workflowV1Contracts";
import { WORKFLOW_V1_MAX_ACCEPTED_SOURCES } from "./workflowV1Contracts";
import {
  reduceTerminalEntry,
  terminalIntentDecision,
} from "./workflowV1Intent";
import {
  allowedWorkflowLaunches,
  arraysEqual,
  EVENT_KINDS,
  expectedSystemEvent,
  REQUIRED_GROUPS,
} from "./workflowV1Policy";
import { projectWorkflowV1State } from "./workflowV1Projection";

export function replayWorkflowV1(
  entries: readonly WorkflowV1LedgerEntry[],
): WorkflowV1Replay | Extract<WorkflowV1State, { readonly kind: "invalid" }> {
  const milestones = new Set<WorkflowV1SystemEventKind>();
  const accepted = new Map<string, string>();
  const artifactIds = new Set<string>();
  const failed = new Map<string, number>();
  const pending = new Map<number, string>();
  const projectedBallots = new Set<string>();
  const sourceIds = new Set<string>();
  const sourceArtifactIds = new Set<string>();
  let launches: readonly WorkflowV1LaunchState[] = [];
  let collectionCompleted = false;
  let followups: readonly string[] | null = null;
  let replacementCount = 0;
  let cancellationIntentId: string | null = null;
  let failureIntentId: string | null = null;
  let failureRequestedReason: string | null = null;
  let reportReady: WorkflowV1ReportReadyEntry | null = null;
  let terminal: WorkflowV1Phase | null = null;
  const runId = entries[0]?.runId;
  const snapshotId = entries[0]?.snapshotId;
  for (const [index, event] of entries.entries()) {
    if (event.sequence !== index + 1)
      return invalid("sequence_invalid", event.sequence);
    if (event.runId !== runId)
      return invalid("cross_run_entry", event.sequence);
    if (event.snapshotId !== snapshotId)
      return invalid("cross_snapshot_entry", event.sequence);
    if (terminal !== null)
      return invalid("entry_after_terminal", event.sequence);
    const intent = terminalIntentDecision(
      {
        cancellationIntentId,
        failureIntentId,
        failureReason: failureRequestedReason,
      },
      event,
    );
    if (intent.kind === "duplicate") continue;
    if (intent.kind === "reject") return invalid(intent.reason, event.sequence);
    const terminalEntry = reduceTerminalEntry(event, {
      cancellationIntentId,
      failureIntentId,
      failureReason: failureRequestedReason,
      pendingCount: pending.size,
    });
    if (terminalEntry.kind === "reject")
      return invalid(terminalEntry.reason, event.sequence);
    if (terminalEntry.kind === "update") {
      cancellationIntentId = terminalEntry.cancellationIntentId;
      failureIntentId = terminalEntry.failureIntentId;
      failureRequestedReason = terminalEntry.failureReason;
      terminal = terminalEntry.terminal;
      continue;
    }
    const acceptedIds = new Set(accepted.keys());
    if (event.type === "system_event") {
      if (
        event.eventKind !==
        expectedSystemEvent(
          milestones,
          collectionCompleted,
          acceptedIds,
          projectedBallots,
        )
      )
        return invalid("event_order_invalid", event.sequence);
      milestones.add(event.eventKind);
    } else if (event.type === "source_accepted") {
      if (!milestones.has("collection_started") || collectionCompleted)
        return invalid("fetch_after_cutoff", event.sequence);
      const sourceFailure = admitWorkflowSource(
        event,
        { sourceIds, artifactIds: sourceArtifactIds },
        WORKFLOW_V1_MAX_ACCEPTED_SOURCES,
      );
      if (sourceFailure !== null) return invalid(sourceFailure, event.sequence);
    } else if (event.type === "collection_completed") {
      if (!milestones.has("collection_started") || collectionCompleted)
        return invalid("event_order_invalid", event.sequence);
      collectionCompleted = true;
    } else if (event.type === "followups_planned") {
      const unique = new Set(event.logicalArtifactIds);
      if (
        followups !== null ||
        REQUIRED_GROUPS[2].some(
          (slot) => !accepted.has(slot.logicalArtifactId),
        ) ||
        event.logicalArtifactIds.length >
          CALL_BUDGET_POLICY.maxOptionalFollowups ||
        unique.size !== event.logicalArtifactIds.length ||
        event.logicalArtifactIds.some(
          (id) => requiredArtifactSlotById(id)?.stage !== "follow_up",
        )
      )
        return invalid("followup_plan_invalid", event.sequence);
      followups = event.logicalArtifactIds;
    } else if (event.type === "launch_reserved") {
      if (
        !Number.isInteger(event.ordinal) ||
        event.ordinal <= 0 ||
        event.ordinal !== launches.length + 1
      )
        return invalid("ordinal_invalid", event.sequence);
      if (launches.length >= CALL_BUDGET_POLICY.maxPhysicalLaunches)
        return invalid("physical_limit_exceeded", event.sequence);
      if (failed.has(event.logicalArtifactId)) {
        if (replacementCount >= CALL_BUDGET_POLICY.maxRequiredReplacements)
          return invalid("replacement_limit_exceeded", event.sequence);
        replacementCount += 1;
      }
      if (
        !allowedWorkflowLaunches({
          accepted: acceptedIds,
          failed,
          followups,
          milestones,
          pending: new Set(pending.values()),
        }).includes(event.logicalArtifactId)
      )
        return invalid("event_order_invalid", event.sequence);
      pending.set(event.ordinal, event.logicalArtifactId);
      launches = [
        ...launches,
        {
          ordinal: event.ordinal,
          logicalArtifactId: event.logicalArtifactId,
          status: "reserved",
        },
      ];
    } else if (event.type === "launch_finished") {
      if (pending.get(event.ordinal) !== event.logicalArtifactId)
        return invalid("launch_outcome_mismatch", event.sequence);
      const count = (failed.get(event.logicalArtifactId) ?? 0) + 1;
      if (count > 2) return invalid("replacement_repeated", event.sequence);
      failed.set(event.logicalArtifactId, count);
      pending.delete(event.ordinal);
      launches = launches.map((launch) =>
        launch.ordinal === event.ordinal
          ? { ...launch, status: "failed", outcome: event.outcome }
          : launch,
      );
    } else if (event.type === "artifact_event_committed") {
      if (pending.get(event.ordinal) !== event.logicalArtifactId)
        return invalid("commit_without_reservation", event.sequence);
      const slot = requiredArtifactSlotById(event.logicalArtifactId);
      if (
        accepted.has(event.logicalArtifactId) ||
        artifactIds.has(event.artifactId)
      )
        return invalid("artifact_repeated", event.sequence);
      if (slot === undefined)
        return invalid("unexpected_artifact", event.sequence);
      if (slot.ownerId !== event.actorId)
        return invalid("actor_ownership_mismatch", event.sequence);
      if (!arraysEqual(EVENT_KINDS[slot.stage], event.eventKinds))
        return invalid("artifact_event_mismatch", event.sequence);
      accepted.set(event.logicalArtifactId, event.artifactId);
      artifactIds.add(event.artifactId);
      pending.delete(event.ordinal);
      launches = launches.map((launch) =>
        launch.ordinal === event.ordinal
          ? { ...launch, status: "accepted" }
          : launch,
      );
    } else if (event.type === "ballot_event_projected") {
      const slot = requiredArtifactSlotById(event.logicalArtifactId);
      if (
        !milestones.has("gathering_started") ||
        slot?.stage !== "owner_response_ballot" ||
        slot.ownerId !== event.actorId ||
        accepted.get(event.logicalArtifactId) !== event.artifactId ||
        projectedBallots.has(event.logicalArtifactId)
      )
        return invalid("ballot_projection_invalid", event.sequence);
      projectedBallots.add(event.logicalArtifactId);
    } else if (event.type === "report_ready") {
      if (
        !isAcceptableReportReadiness(
          event,
          reportReady,
          accepted.get("chair_synthesis:chair"),
        )
      )
        return invalid("report_binding_invalid", event.sequence);
      reportReady = event;
    } else if (event.type === "report_event_committed") {
      if (!isMatchingReportPublication(event, reportReady))
        return invalid("report_binding_invalid", event.sequence);
      terminal = "published";
    }
  }
  return {
    state: projectWorkflowV1State({
      milestones,
      collectionCompleted,
      accepted,
      acceptedSourceCount: sourceIds.size,
      terminal,
      cancellationRequested: cancellationIntentId !== null,
      cancellationIntentId,
      failureRequestedReason,
      failureIntentId,
      launches,
      replacementCount,
      followups,
      failed,
      projectedBallots,
    }),
    milestones,
    collectionCompleted,
  };
}

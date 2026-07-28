import type {
  WorkflowV1LaunchState,
  WorkflowV1Phase,
  WorkflowV1SystemEventKind,
  WorkflowV1ValidState,
} from "./workflowV1Contracts";
import { phaseFor } from "./workflowV1Policy";

type ProjectionInput = {
  readonly milestones: ReadonlySet<WorkflowV1SystemEventKind>;
  readonly collectionCompleted: boolean;
  readonly accepted: ReadonlyMap<string, string>;
  readonly acceptedSourceCount: number;
  readonly terminal: WorkflowV1Phase | null;
  readonly cancellationRequested: boolean;
  readonly cancellationIntentId: string | null;
  readonly failureRequestedReason: string | null;
  readonly failureIntentId: string | null;
  readonly launches: readonly WorkflowV1LaunchState[];
  readonly replacementCount: number;
  readonly followups: readonly string[] | null;
  readonly failed: ReadonlyMap<string, number>;
  readonly projectedBallots: ReadonlySet<string>;
};

export function projectWorkflowV1State(
  input: ProjectionInput,
): WorkflowV1ValidState {
  const acceptedIds = new Set(input.accepted.keys());
  return {
    kind: "valid",
    phase:
      input.cancellationRequested && input.terminal === null
        ? "cancelling"
        : phaseFor(
            input.milestones,
            input.collectionCompleted,
            acceptedIds,
            input.terminal,
          ),
    terminal: input.terminal !== null,
    recoverable: input.terminal === null,
    acceptedArtifactCount: input.accepted.size,
    physicalLaunchCount: input.launches.length,
    acceptedSourceCount: input.acceptedSourceCount,
    requiredReplacementCount: input.replacementCount,
    burnedOrdinals: input.launches
      .filter((launch) => launch.status === "failed")
      .map((launch) => launch.ordinal),
    acceptedLogicalArtifactIds: [...input.accepted.keys()],
    launches: input.launches,
    pendingReservations: input.launches.filter(
      (launch) => launch.status === "reserved",
    ),
    cancellationRequested: input.cancellationRequested,
    cancellationIntentId: input.cancellationIntentId,
    failureRequestedReason: input.failureRequestedReason,
    failureIntentId: input.failureIntentId,
    followupsPlanned: input.followups,
    failedLogicalArtifactIds: [...input.failed.keys()],
    projectedBallotArtifactIds: [...input.projectedBallots].map(
      (id) => input.accepted.get(id) ?? "",
    ),
  };
}

import {
  CALL_BUDGET_POLICY,
  type CallBudgetLedger,
  createCallBudgetLedger,
  type LaunchOutcome,
  reserveResearchLaunch,
} from "../domain/callBudget";
import { WORKFLOW_V1_ROSTER_FINGERPRINT } from "../domain/roleRegistry";
import type {
  ChildRunCommand,
  DurableChildRunStorePort,
} from "../ports/runControl";

type RetryableParent = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly status: string;
  readonly terminalReason?: string;
  readonly ledger: CallBudgetLedger;
};

type ReplacementFailure =
  | "invalid_schema"
  | "process_crash"
  | "timeout"
  | "lost"
  | "uncertain"
  | "cancelled"
  | "unknown"
  | "transient_source";

function launchOutcomeFor(
  failure: Exclude<ReplacementFailure, "transient_source">,
): LaunchOutcome {
  if (failure === "cancelled") return "cancelled_race";
  if (failure === "unknown") return "uncertain";
  return failure;
}

export function retryRun(
  parent: RetryableParent,
  input: { readonly childRunId: string; readonly createdAt: string },
) {
  if (
    (parent.status !== "failed" && parent.status !== "incomplete") ||
    parent.terminalReason === "rights_failure"
  )
    return Object.freeze({ kind: "not_retryable" as const, parent });
  return Object.freeze({
    kind: "created" as const,
    parent,
    run: Object.freeze({
      runId: input.childRunId,
      snapshotId: parent.snapshotId,
      status: "queued" as const,
      createdAt: input.createdAt,
      lineage: Object.freeze({
        kind: "same-snapshot-retry" as const,
        parentRunId: parent.runId,
        parentSnapshotId: parent.snapshotId,
      }),
      ledger: createCallBudgetLedger({
        runId: input.childRunId,
        rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
      }),
      maxPhysicalLaunches: CALL_BUDGET_POLICY.maxPhysicalLaunches,
    }),
  });
}

export function reserveReplacement(
  run: RetryableParent,
  request: {
    readonly logicalArtifactId: string;
    readonly failure: ReplacementFailure;
    readonly attemptId: string;
  },
) {
  if (request.failure === "transient_source")
    return Object.freeze({ kind: "source_retry" as const, run });
  const expectedOutcome = launchOutcomeFor(request.failure);
  const failedFirstAttempt = run.ledger.launches.find(
    (launch) =>
      launch.logicalArtifactId === request.logicalArtifactId &&
      launch.purpose === "mandatory_first" &&
      launch.outcome === expectedOutcome,
  );
  if (failedFirstAttempt === undefined)
    return Object.freeze({ kind: "incomplete" as const, run });
  const ordinal = (run.ledger.launches.at(-1)?.ordinal ?? 0) + 1;
  const transition = reserveResearchLaunch(run.ledger, {
    ordinal,
    attemptId: request.attemptId,
    logicalArtifactId: request.logicalArtifactId,
    purpose: "required_replacement",
    rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
  });
  if (transition.kind !== "reserved")
    return Object.freeze({
      kind: "incomplete" as const,
      run: Object.freeze({ ...run, ledger: transition.ledger }),
    });
  return Object.freeze({
    kind: "reserved" as const,
    run: Object.freeze({ ...run, ledger: transition.ledger }),
  });
}

export function retryStoredRun(
  store: DurableChildRunStorePort,
  input: Omit<ChildRunCommand, "kind" | "snapshotId" | "priorReportId">,
) {
  return store.createChildRun({
    ...input,
    kind: "same-snapshot-retry",
  });
}

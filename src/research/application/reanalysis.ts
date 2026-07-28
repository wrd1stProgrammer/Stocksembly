import {
  CALL_BUDGET_POLICY,
  createCallBudgetLedger,
} from "../domain/callBudget";
import { WORKFLOW_V1_ROSTER_FINGERPRINT } from "../domain/roleRegistry";
import type {
  ChildRunCommand,
  DurableChildRunStorePort,
} from "../ports/runControl";

export function reanalyzeRun(
  parent: {
    readonly runId: string;
    readonly snapshotId: string;
    readonly status: string;
    readonly reportId: string;
    readonly launches: readonly unknown[];
  },
  input: {
    readonly childRunId: string;
    readonly snapshotId: string;
    readonly createdAt: string;
  },
) {
  if (
    input.snapshotId === parent.snapshotId ||
    (parent.status !== "completed" &&
      parent.status !== "complete-with-limitations")
  )
    return Object.freeze({ kind: "not_reanalyzable" as const, parent });
  return Object.freeze({
    kind: "created" as const,
    parent,
    run: Object.freeze({
      runId: input.childRunId,
      snapshotId: input.snapshotId,
      status: "queued" as const,
      createdAt: input.createdAt,
      lineage: Object.freeze({
        kind: "new-snapshot-follow-up" as const,
        parentRunId: parent.runId,
        parentSnapshotId: parent.snapshotId,
      }),
      priorReportId: parent.reportId,
      ledger: createCallBudgetLedger({
        runId: input.childRunId,
        rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
      }),
      maxPhysicalLaunches: CALL_BUDGET_POLICY.maxPhysicalLaunches,
    }),
  });
}

export type PreSpawnBudget = {
  readonly burnedOrdinals: number;
  readonly remainingBaseCalls: number;
  readonly requestedOptionalCalls: number;
  readonly requestedReplacementCalls: number;
};

export function verifyPreSpawnBudget(request: PreSpawnBudget) {
  const required =
    request.burnedOrdinals +
    request.remainingBaseCalls +
    request.requestedOptionalCalls +
    request.requestedReplacementCalls;
  if (required > CALL_BUDGET_POLICY.maxPhysicalLaunches)
    return Object.freeze({
      kind: "incomplete" as const,
      status: "incomplete" as const,
      publicLimitation: Object.freeze({
        code: "physical_launch_budget_exhausted" as const,
        maximum: CALL_BUDGET_POLICY.maxPhysicalLaunches,
        required,
      }),
    });
  return Object.freeze({
    kind: "allowed" as const,
    maximumPhysicalLaunches: required,
  });
}

export function reanalyzeStoredRun(
  store: DurableChildRunStorePort,
  input: Omit<ChildRunCommand, "kind"> & {
    readonly snapshotId: NonNullable<ChildRunCommand["snapshotId"]>;
    readonly priorReportId: NonNullable<ChildRunCommand["priorReportId"]>;
  },
) {
  return store.createChildRun({
    ...input,
    kind: "new-snapshot-follow-up",
  });
}

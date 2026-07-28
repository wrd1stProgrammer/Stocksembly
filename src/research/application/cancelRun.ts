export type CancelJobStatus =
  | "queued"
  | "leased"
  | "spawn-reserved"
  | "running"
  | "retry-wait"
  | "cancel-requested"
  | "cancelled"
  | "succeeded"
  | "failed";

export type CancelJob = {
  readonly jobId: string;
  readonly status: CancelJobStatus;
  readonly attemptId?: string;
  readonly ordinal?: number;
};

export type BurnedLaunch = {
  readonly ordinal: number;
  readonly outcome:
    | "reserved"
    | "cancelled"
    | "accepted"
    | "failed"
    | "unknown";
};

export type CancellableRun = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly status:
    | "queued"
    | "running"
    | "cancelling"
    | "completed"
    | "complete-with-limitations"
    | "cancelled"
    | "failed"
    | "incomplete";
  readonly jobs: readonly CancelJob[];
  readonly launches: readonly BurnedLaunch[];
  readonly partialArtifactIds?: readonly string[];
  readonly reportId?: string;
};

export type AbortActiveRun = (
  runId: string,
  killGraceMs: number,
) => Promise<void>;

export interface RunControlTransactionPort {
  readonly findRun: (runId: string) => Promise<CancellableRun>;
  readonly saveRun: (run: CancellableRun) => Promise<void>;
}

export interface RunControlStorePort {
  readonly transaction: <Result>(
    operation: (transaction: RunControlTransactionPort) => Promise<Result>,
  ) => Promise<Result>;
}

const terminal = new Set<CancellableRun["status"]>([
  "completed",
  "complete-with-limitations",
  "cancelled",
  "failed",
  "incomplete",
]);

const activeJobs = new Set<CancelJobStatus>([
  "leased",
  "spawn-reserved",
  "running",
  "cancel-requested",
]);

type CancellationRequest =
  | {
      readonly kind: "requested";
      readonly run: CancellableRun;
      readonly active: boolean;
    }
  | { readonly kind: "terminal_immutable"; readonly run: CancellableRun };

function requestCancellation(run: CancellableRun): CancellationRequest {
  if (terminal.has(run.status))
    return Object.freeze({ kind: "terminal_immutable", run });
  const active = run.jobs.some((job) => activeJobs.has(job.status));
  return Object.freeze({
    kind: "requested",
    active,
    run: Object.freeze({
      ...run,
      status: active ? "cancelling" : "cancelled",
      jobs: Object.freeze(
        run.jobs.map((job) => {
          if (job.status === "queued" || job.status === "retry-wait")
            return Object.freeze({ ...job, status: "cancelled" as const });
          if (activeJobs.has(job.status))
            return Object.freeze({
              ...job,
              status: "cancel-requested" as const,
            });
          return job;
        }),
      ),
    }),
  });
}

function finalizeCancellation(run: CancellableRun): CancellableRun {
  if (run.status === "cancelled") return run;
  const { reportId, ...unpublished } = run;
  void reportId;
  return Object.freeze({
    ...unpublished,
    status: "cancelled",
    jobs: Object.freeze(
      run.jobs.map((job) =>
        job.status === "succeeded" || job.status === "failed"
          ? job
          : Object.freeze({ ...job, status: "cancelled" as const }),
      ),
    ),
    launches: Object.freeze(
      run.launches.map((launch) =>
        launch.outcome === "reserved"
          ? Object.freeze({ ...launch, outcome: "cancelled" as const })
          : launch,
      ),
    ),
  });
}

export async function cancelRun(
  run: CancellableRun,
  abort: AbortActiveRun,
): Promise<
  | { readonly kind: "cancelled"; readonly run: CancellableRun }
  | { readonly kind: "terminal_immutable"; readonly run: CancellableRun }
> {
  const request = requestCancellation(run);
  if (request.kind === "terminal_immutable") return request;
  if (request.active) await abort(run.runId, 5_000);
  return Object.freeze({
    kind: "cancelled",
    run: finalizeCancellation(request.run),
  });
}

export async function cancelStoredRun(
  store: RunControlStorePort,
  runId: string,
  abort: AbortActiveRun,
) {
  const request = await store.transaction(async (transaction) => {
    const current = await transaction.findRun(runId);
    const planned = requestCancellation(current);
    if (planned.kind === "requested") await transaction.saveRun(planned.run);
    return planned;
  });
  if (request.kind === "terminal_immutable") return request;
  if (request.active) await abort(runId, 5_000);
  return await store.transaction(async (transaction) => {
    const current = await transaction.findRun(runId);
    const run = finalizeCancellation(current);
    await transaction.saveRun(run);
    return Object.freeze({ kind: "cancelled" as const, run });
  });
}

export function preserveRunOnSseDisconnect<Run>(run: Run): Run {
  return run;
}

export function commitRunReport(
  run: CancellableRun,
  reportId: string,
):
  | { readonly kind: "committed"; readonly run: CancellableRun }
  | {
      readonly kind: "cancellation_won" | "terminal_immutable";
      readonly run: CancellableRun;
    } {
  if (run.status === "cancelling" || run.status === "cancelled")
    return Object.freeze({ kind: "cancellation_won", run });
  if (terminal.has(run.status))
    return Object.freeze({ kind: "terminal_immutable", run });
  return Object.freeze({
    kind: "committed",
    run: Object.freeze({ ...run, status: "completed", reportId }),
  });
}

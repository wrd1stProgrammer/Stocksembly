import type { PollResult } from "./leaseEngineTypes";
import { LEASE_ENGINE_DEFAULTS } from "./leaseEngineTypes";

export type LeaseWorkerLifecycle = {
  readonly heartbeat?: (extended: number) => void;
  readonly result?: (result: PollResult) => void;
};

export type LeaseWorkerSchedulerOptions = {
  readonly pollIntervalMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly stopWhenIdle?: boolean;
  readonly lifecycle?: LeaseWorkerLifecycle;
  readonly waitForWork?: (signal: AbortSignal) => Promise<boolean>;
};

export interface LeaseWorkerSchedulerEngine {
  readonly poll: () => Promise<PollResult>;
  readonly heartbeat: () => number;
  readonly recoverExpired: () => readonly string[];
  readonly reconcile: () => Promise<boolean>;
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });

    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}

function batchIsIdle(results: readonly PollResult[]): boolean {
  return results.every(
    (result) => result.kind === "idle" || result.kind === "stopping",
  );
}

export async function runLeaseWorkerScheduler(
  engine: LeaseWorkerSchedulerEngine,
  signal: AbortSignal,
  options: LeaseWorkerSchedulerOptions = {},
): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? LEASE_ENGINE_DEFAULTS.heartbeatMs;
  const heartbeatTimer = setInterval(() => {
    options.lifecycle?.heartbeat?.(engine.heartbeat());
  }, heartbeatIntervalMs);

  try {
    while (!signal.aborted) {
      engine.recoverExpired();
      if (!(await engine.reconcile())) {
        options.lifecycle?.result?.({ kind: "recovery-pending" });
        await wait(pollIntervalMs, signal);
        continue;
      }
      const results = await Promise.all(
        Array.from({ length: LEASE_ENGINE_DEFAULTS.globalCodexProcesses }, () =>
          engine.poll(),
        ),
      );
      for (const result of results)
        if (result.kind !== "idle") options.lifecycle?.result?.(result);
      const idle = batchIsIdle(results);
      if (options.stopWhenIdle === true && idle) return;
      if (!signal.aborted) {
        if (idle && options.waitForWork !== undefined)
          await options.waitForWork(signal);
        else await wait(pollIntervalMs, signal);
      }
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

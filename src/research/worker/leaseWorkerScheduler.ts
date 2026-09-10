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

  const inFlight = new Set<Promise<void>>();
  const failures: unknown[] = [];
  try {
    while (!signal.aborted) {
      if (failures.length > 0) throw failures[0];
      engine.recoverExpired();
      if (!(await engine.reconcile())) {
        options.lifecycle?.result?.({ kind: "recovery-pending" });
        await wait(pollIntervalMs, signal);
        continue;
      }
      if (signal.aborted) break;
      let idle = true;
      const available =
        LEASE_ENGINE_DEFAULTS.globalCodexProcesses - inFlight.size;
      for (let index = 0; index < available; index += 1) {
        const task = engine.poll().then(
          (result) => {
            inFlight.delete(task);
            if (result.kind !== "idle" && result.kind !== "stopping")
              idle = false;
            if (result.kind !== "idle") options.lifecycle?.result?.(result);
          },
          (error: unknown) => {
            inFlight.delete(task);
            failures.push(error);
          },
        );
        inFlight.add(task);
      }
      await Promise.resolve();
      if (failures.length > 0) throw failures[0];
      if (inFlight.size === 0 && idle && options.stopWhenIdle === true) return;
      if (!signal.aborted) {
        if (inFlight.size === 0 && idle && options.waitForWork !== undefined)
          await options.waitForWork(signal);
        else await wait(pollIntervalMs, signal);
      }
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

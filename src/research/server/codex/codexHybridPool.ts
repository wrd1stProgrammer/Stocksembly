import type { ResearchExecutionBackend } from "../../domain/researchExecution";

export interface CodexHybridLease {
  backend: ResearchExecutionBackend;
  release(): void;
}

export interface CodexHybridPoolOptions {
  subscriptionAvailable(): boolean;
  apiEnabled(): boolean;
  subscriptionCapacity?: number;
  apiCapacity?: number;
  spillAfterMs?: number;
}

interface Waiter {
  runId: string;
  queuedAt: number;
  resolve(lease: CodexHybridLease): void;
  reject(reason: unknown): void;
  signal?: AbortSignal;
  onAbort(): void;
}

/** Shared by all Codex ports in a worker, including auxiliary collection calls. */
export function createCodexHybridPool(options: CodexHybridPoolOptions) {
  const subscriptionCapacity = positiveInteger(
    options.subscriptionCapacity,
    10,
  );
  const apiCapacity = positiveInteger(options.apiCapacity, 6);
  const spillAfterMs = nonnegativeInteger(options.spillAfterMs, 30_000);
  const active = { subscription: 0, api: 0 };
  const activeByRun = new Map<string, number>();
  const lastServed = new Map<string, number>();
  const queue: Waiter[] = [];
  let sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function remove(waiter: Waiter) {
    const index = queue.indexOf(waiter);
    if (index !== -1) queue.splice(index, 1);
    waiter.signal?.removeEventListener("abort", waiter.onAbort);
  }

  function pick(eligible: (waiter: Waiter) => boolean) {
    let selected: Waiter | undefined;
    for (const waiter of queue) {
      if (!eligible(waiter)) continue;
      if (!selected) {
        selected = waiter;
        continue;
      }
      const activeDifference =
        (activeByRun.get(waiter.runId) ?? 0) -
        (activeByRun.get(selected.runId) ?? 0);
      if (
        activeDifference < 0 ||
        (activeDifference === 0 &&
          (lastServed.get(waiter.runId) ?? 0) <
            (lastServed.get(selected.runId) ?? 0))
      ) {
        selected = waiter;
      }
    }
    return selected;
  }

  function grant(waiter: Waiter, backend: ResearchExecutionBackend) {
    remove(waiter);
    active[backend] += 1;
    activeByRun.set(waiter.runId, (activeByRun.get(waiter.runId) ?? 0) + 1);
    lastServed.set(waiter.runId, ++sequence);
    let released = false;
    waiter.resolve({
      backend,
      release() {
        if (released) return;
        released = true;
        active[backend] -= 1;
        const remaining = (activeByRun.get(waiter.runId) ?? 1) - 1;
        if (remaining === 0) activeByRun.delete(waiter.runId);
        else activeByRun.set(waiter.runId, remaining);
        refresh();
      },
    });
  }

  function refresh() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const apiEnabled = options.apiEnabled();
    const subscriptionAvailable =
      options.subscriptionAvailable() || !apiEnabled;
    while (
      subscriptionAvailable &&
      active.subscription < subscriptionCapacity
    ) {
      const waiter = pick(() => true);
      if (!waiter) break;
      grant(waiter, "subscription");
    }
    while (apiEnabled && active.api < apiCapacity) {
      const waiter = pick(
        (entry) =>
          !subscriptionAvailable || Date.now() - entry.queuedAt >= spillAfterMs,
      );
      if (!waiter) break;
      grant(waiter, "api");
    }
    if (
      apiEnabled &&
      subscriptionAvailable &&
      active.api < apiCapacity &&
      queue.length > 0
    ) {
      const nextSpillAt = Math.min(
        ...queue.map((entry) => entry.queuedAt + spillAfterMs),
      );
      timer = setTimeout(refresh, Math.max(1, nextSpillAt - Date.now()));
    }
    for (const runId of lastServed.keys()) {
      if (
        !activeByRun.has(runId) &&
        !queue.some((entry) => entry.runId === runId)
      ) {
        lastServed.delete(runId);
      }
    }
  }

  return {
    refresh,
    acquire(runId: string, signal?: AbortSignal): Promise<CodexHybridLease> {
      if (signal?.aborted)
        return Promise.reject(
          signal.reason ?? new DOMException("Aborted", "AbortError"),
        );
      return new Promise((resolve, reject) => {
        const waiter: Waiter = {
          runId,
          queuedAt: Date.now(),
          resolve,
          reject,
          ...(signal === undefined ? {} : { signal }),
          onAbort() {
            remove(waiter);
            reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
            refresh();
          },
        };
        queue.push(waiter);
        signal?.addEventListener("abort", waiter.onAbort, { once: true });
        refresh();
      });
    },
  };
}

function positiveInteger(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function nonnegativeInteger(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

import { describe, expect, it } from "vitest";
import { LEASE_ENGINE_DEFAULTS, type PollResult } from "./leaseEngineTypes";
import { runLeaseWorkerScheduler } from "./leaseWorkerScheduler";

describe("continuous research scheduling", () => {
  it("fills a released slot while a slower job is still running", async () => {
    const stop = new AbortController();
    let releaseSlow = () => {};
    let polls = 0;
    let refilled = false;
    const slow = new Promise<PollResult>((resolve) => {
      releaseSlow = () => resolve({ kind: "idle" });
    });
    const timeout = setTimeout(() => {
      stop.abort();
      releaseSlow();
    }, 150);
    await runLeaseWorkerScheduler(
      {
        heartbeat: () => 0,
        recoverExpired: () => [],
        reconcile: async () => true,
        poll: () => {
          polls += 1;
          if (polls === 1) return slow;
          if (polls > LEASE_ENGINE_DEFAULTS.globalCodexProcesses) {
            refilled = true;
            stop.abort();
            releaseSlow();
          }
          return Promise.resolve({ kind: "idle" });
        },
      },
      stop.signal,
      { pollIntervalMs: 1 },
    );
    clearTimeout(timeout);
    expect(refilled).toBe(true);
  });
});

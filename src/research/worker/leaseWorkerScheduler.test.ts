import { describe, expect, it } from "vitest";
import { runLeaseWorkerScheduler } from "./leaseWorkerScheduler";

describe("lease worker scheduler", () => {
  it("recovers a lease that expires after the replacement worker starts", async () => {
    // Given
    const controller = new AbortController();
    let leaseExpired = false;
    let recovered = false;
    let reconciliations = 0;
    const engine = {
      recoverExpired: () => {
        if (leaseExpired) recovered = true;
        return [];
      },
      reconcile: async () => {
        reconciliations += 1;
        if (reconciliations === 1) leaseExpired = true;
        if (reconciliations === 3) controller.abort();
        return true;
      },
      poll: async () => {
        if (recovered) controller.abort();
        return { kind: "idle" as const };
      },
      heartbeat: () => 0,
    };

    // When
    await runLeaseWorkerScheduler(engine, controller.signal, {
      pollIntervalMs: 1,
      heartbeatIntervalMs: 5,
    });

    // Then
    expect(recovered).toBe(true);
  });

  it("waits for an external work signal instead of continuously polling", async () => {
    const controller = new AbortController();
    let polls = 0;
    let waits = 0;
    const engine = {
      recoverExpired: () => [],
      reconcile: () => Promise.resolve(true),
      poll: () => {
        polls += 1;
        return Promise.resolve({ kind: "idle" as const });
      },
      heartbeat: () => 0,
    };

    await runLeaseWorkerScheduler(engine, controller.signal, {
      heartbeatIntervalMs: 50,
      waitForWork: () => {
        waits += 1;
        if (waits === 2) controller.abort();
        return Promise.resolve(true);
      },
    });

    expect(waits).toBe(2);
    expect(polls).toBeGreaterThan(1);
  });
});

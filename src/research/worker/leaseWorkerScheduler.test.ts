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
});

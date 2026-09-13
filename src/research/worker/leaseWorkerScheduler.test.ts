import { describe, expect, it } from "vitest";
import {
  AttemptIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { uuid } from "./leaseEngine.testSupport";
import { runLeaseWorkerScheduler } from "./leaseWorkerScheduler";

describe("lease worker scheduler", () => {
  it("recovers a lease that expires after the replacement worker starts", async () => {
    // Given
    const controller = new AbortController();
    let leaseExpired = false;
    let recovered = false;
    let reconciliations = 0;
    const engine = {
      recoverExpired: async () => {
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
      heartbeat: async () => 0,
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
      recoverExpired: async () => [],
      reconcile: () => Promise.resolve(true),
      poll: () => {
        polls += 1;
        return Promise.resolve({ kind: "idle" as const });
      },
      heartbeat: async () => 0,
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

it("drains when PostgreSQL-style asynchronous polls all resolve idle", async () => {
  let polls = 0;
  const controller = new AbortController();
  await runLeaseWorkerScheduler(
    {
      heartbeat: async () => 0,
      recoverExpired: async () => [],
      reconcile: async () => true,
      poll: async () => {
        polls += 1;
        await new Promise((resolve) => setTimeout(resolve, 2));
        return { kind: "idle" };
      },
    },
    controller.signal,
    { stopWhenIdle: true, pollIntervalMs: 5 },
  );
  expect(polls).toBeGreaterThan(0);
  expect(controller.signal.aborted).toBe(false);
});

it("drains successor work created by a completed asynchronous attempt before stopping", async () => {
  const controller = new AbortController();
  let claimed = false;
  let successor = false;
  let successorProcessed = false;
  const result = {
    kind: "handled" as const,
    attempt: {
      attemptId: AttemptIdSchema.parse(uuid(1)),
      jobId: JobIdSchema.parse(uuid(2)),
      runId: RunIdSchema.parse(uuid(3)),
      snapshotId: SnapshotIdSchema.parse(uuid(4)),
      kind: "research" as const,
      ordinal: 1,
    },
    outcome: { kind: "accepted" as const },
    committed: true,
    coordinationPending: false,
  };
  await runLeaseWorkerScheduler(
    {
      heartbeat: async () => 0,
      recoverExpired: async () => [],
      reconcile: async () => true,
      poll: async () => {
        if (!claimed) {
          claimed = true;
          await new Promise((resolve) => setTimeout(resolve, 2));
          successor = true;
          return result;
        }
        if (successor && !successorProcessed) {
          successorProcessed = true;
          return result;
        }
        await new Promise((resolve) => setTimeout(resolve, 3));
        return { kind: "idle" };
      },
    },
    controller.signal,
    { stopWhenIdle: true, pollIntervalMs: 5 },
  );
  expect(successorProcessed).toBe(true);
});

it("drains active work without aborting it or claiming another job", async () => {
  const controller = new AbortController();
  let draining = false;
  let completed = false;
  let heartbeats = 0;
  let pollsAfterDrain = 0;
  await runLeaseWorkerScheduler(
    {
      recoverExpired: async () => [],
      reconcile: async () => true,
      heartbeat: async () => {
        heartbeats += 1;
        return 1;
      },
      poll: async () => {
        if (draining) pollsAfterDrain += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        draining = true;
        await new Promise((resolve) => setTimeout(resolve, 30));
        completed = true;
        return { kind: "idle" };
      },
    },
    controller.signal,
    { shouldDrain: () => draining, pollIntervalMs: 2, heartbeatIntervalMs: 3 },
  );
  expect(completed).toBe(true);
  expect(pollsAfterDrain).toBe(0);
  expect(heartbeats).toBeGreaterThan(1);
  expect(controller.signal.aborted).toBe(false);
});

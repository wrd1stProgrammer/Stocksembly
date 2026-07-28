import { describe, expect, it, vi } from "vitest";
import {
  type CancellableRun,
  cancelRun,
  cancelStoredRun,
  commitRunReport,
  preserveRunOnSseDisconnect,
  type RunControlStorePort,
} from "./cancelRun";

const parent = {
  runId: "00000000-0000-4000-8000-000000000001",
  snapshotId: "00000000-0000-4000-8000-000000000002",
  status: "running" as const,
  jobs: [
    { jobId: "queued", status: "queued" as const },
    {
      jobId: "active",
      status: "running" as const,
      attemptId: "00000000-0000-4000-8000-000000000003",
      ordinal: 1,
    },
  ],
  launches: [{ ordinal: 1, outcome: "reserved" as const }],
  partialArtifactIds: ["partial"],
};

describe("cancelRun", () => {
  it("cancels unleased work, burns active work, escalates abort, and excludes partial reports", async () => {
    // Given
    const abort = vi.fn().mockResolvedValue(undefined);

    // When
    const result = await cancelRun(parent, abort);

    // Then
    expect(result.run.status).toBe("cancelled");
    expect(result.run.jobs.map((job) => job.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    expect(result.run.launches).toEqual([{ ordinal: 1, outcome: "cancelled" }]);
    expect(result.run.reportId).toBeUndefined();
    expect(abort).toHaveBeenCalledWith(parent.runId, 5_000);
  });

  it("keeps terminal runs immutable and makes both cancel/commit orderings deterministic", async () => {
    // Given
    const committedFirst = commitRunReport(parent, "report");

    // When
    const cancelAfterCommit = await cancelRun(committedFirst.run, vi.fn());
    const cancelledFirst = await cancelRun(parent, vi.fn());
    const commitAfterCancel = commitRunReport(cancelledFirst.run, "partial");

    // Then
    expect(committedFirst.kind).toBe("committed");
    expect(cancelAfterCommit.kind).toBe("terminal_immutable");
    expect(cancelAfterCommit.run.reportId).toBe("report");
    expect(commitAfterCancel.kind).toBe("cancellation_won");
    expect(commitAfterCancel.run.reportId).toBeUndefined();
  });

  it("does not treat an SSE disconnect as cancellation", () => {
    // Given
    const active = parent;

    // When
    const preserved = preserveRunOnSseDisconnect(active);

    // Then
    expect(preserved).toBe(active);
  });

  it.each([
    ["queued", false],
    ["retry-wait", false],
    ["leased", true],
    ["spawn-reserved", true],
    ["running", true],
    ["cancel-requested", true],
  ] as const)(
    "cancels work atomically from the %s phase",
    async (status, active) => {
      // Given
      const abort = vi.fn().mockResolvedValue(undefined);
      const phaseRun = {
        ...parent,
        jobs: [{ jobId: status, status }],
        launches: [],
      };

      // When
      const result = await cancelRun(phaseRun, abort);

      // Then
      expect(result.run.status).toBe("cancelled");
      expect(result.run.jobs[0]?.status).toBe("cancelled");
      expect(abort).toHaveBeenCalledTimes(active ? 1 : 0);
    },
  );

  it("persists cancelling before abort and cancelled after abort in separate transactions", async () => {
    // Given
    let durable: CancellableRun = parent;
    const persistedStatuses: string[] = [];
    const store: RunControlStorePort = {
      transaction: async (operation) =>
        operation({
          findRun: async () => durable,
          saveRun: async (run) => {
            durable = run;
            persistedStatuses.push(run.status);
          },
        }),
    };
    const abort = vi.fn().mockResolvedValue(undefined);

    // When
    const result = await cancelStoredRun(store, parent.runId, abort);

    // Then
    expect(result.run.status).toBe("cancelled");
    expect(persistedStatuses).toEqual(["cancelling", "cancelled"]);
    expect(abort).toHaveBeenCalledTimes(1);
  });
});

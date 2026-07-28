import { spawn, spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import {
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import type { CreateRunInput } from "../server/persistence/sqlite/types";
import {
  createLeaseEngineFixture,
  hash,
  uuid,
} from "./leaseEngine.testSupport";
import type { AttemptHandler } from "./leaseEngineTypes";

function admissionInput(value: number): CreateRunInput {
  const base = value * 100;
  return {
    runId: RunIdSchema.parse(uuid(base + 1)),
    snapshotId: SnapshotIdSchema.parse(uuid(base + 2)),
    requestedAt: "2026-07-23T00:00:00.000Z",
    initialJob: {
      jobId: JobIdSchema.parse(uuid(base + 3)),
      kind: "research",
      logicalKey: `admission:${value}`,
      inputHash: hash(value),
      createdAt: "2026-07-23T00:00:00.000Z",
    },
    initialEvent: {
      eventId: EventIdSchema.parse(uuid(base + 4)),
      type: "run_queued",
      stateId: "queued",
      occurredAt: "2026-07-23T00:00:00.000Z",
    },
  };
}

export function registerLeaseEngineReviewTests(): void {
  it("atomically admits at most eight queued runs while two runs are active", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    fixture.seedResearchJobs(2, 100);
    fixture.seedResearchJobs(2, 200);
    const engines = Array.from({ length: 9 }, (_, index) =>
      fixture.openEngine(`admission-worker-${index}`),
    );

    try {
      // When
      const results = await Promise.all(
        engines.map((engine, index) =>
          Promise.resolve(engine.admit(admissionInput(300 + index))),
        ),
      );

      // Then
      expect(
        results.filter((result) => result.kind === "admitted"),
      ).toHaveLength(8);
      expect(
        results.filter((result) => result.kind === "queue_full"),
      ).toHaveLength(1);
    } finally {
      await Promise.all(engines.map((engine) => engine.shutdown()));
      fixture.cleanup();
    }
  });

  it("polls long-lived work and heartbeats until graceful abort", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const controller = new AbortController();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let releaseAttempt: (() => void) | undefined;
    const attemptReleased = new Promise<void>((resolve) => {
      releaseAttempt = resolve;
    });
    let markHeartbeat: (() => void) | undefined;
    const heartbeat = new Promise<void>((resolve) => {
      markHeartbeat = resolve;
    });
    const engine = fixture.openEngine("scheduler-worker", {
      run: async () => {
        markStarted?.();
        await attemptReleased;
        return { kind: "accepted" };
      },
    });
    const seed = fixture.seedResearchJob(500);

    try {
      // When
      const completion = engine.runUntilStopped(controller.signal, {
        pollIntervalMs: 1,
        heartbeatIntervalMs: 5,
        lifecycle: {
          heartbeat: () => markHeartbeat?.(),
        },
      });
      await started;
      fixture.clock.set("2026-07-22T00:00:10.000Z");
      await heartbeat;
      releaseAttempt?.();
      controller.abort();
      await completion;

      // Then
      expect(fixture.job(seed.jobId)).toMatchObject({
        status: "succeeded",
        lease_expires_at: null,
      });
    } finally {
      releaseAttempt?.();
      controller.abort();
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("reconciles durable workflow progress after an advancement failure", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const controller = new AbortController();
    let reconciliations = 0;
    let advancementAttempts = 0;
    const handler = {
      run: async () => ({ kind: "accepted" as const }),
      afterCommit: async () => {
        advancementAttempts += 1;
        throw new TypeError("coordinator unavailable");
      },
      reconcile: async () => {
        reconciliations += 1;
        if (reconciliations === 2) controller.abort();
      },
    } satisfies AttemptHandler & { readonly reconcile: () => Promise<void> };
    const engine = fixture.openEngine("scheduler-recovery-worker", handler);
    const seed = fixture.seedResearchJob(501);

    try {
      // When
      await engine.runUntilStopped(controller.signal, {
        pollIntervalMs: 1,
        heartbeatIntervalMs: 5,
      });

      // Then
      expect(advancementAttempts).toBe(1);
      expect(reconciliations).toBe(2);
      expect(fixture.job(seed.jobId).status).toBe("succeeded");
    } finally {
      controller.abort();
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("runs the built worker executable against the durable SQLite queue", () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const seed = fixture.seedResearchJob(600);
    const build = spawnSync("pnpm", ["research:worker:build"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    try {
      expect(build.status, build.stderr).toBe(0);

      // When
      const result = spawnSync(
        process.execPath,
        [
          `${process.cwd()}/.stocksembly-verification/research-worker/leaseWorker.js`,
          "--database",
          fixture.databasePath,
          "--owner",
          "process-worker",
          "--verification-outcome",
          "accepted",
          "--drain",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      // Then
      expect(result.status, result.stderr).toBe(0);
      expect(fixture.job(seed.jobId)).toMatchObject({
        status: "succeeded",
        lease_expires_at: null,
      });
      expect(result.stdout).toContain('"kind":"worker_started"');
      expect(result.stdout).toContain('"kind":"worker_stopped"');
    } finally {
      fixture.cleanup();
    }
  });

  it("handles SIGTERM and restarts from the same database with a new ordinal", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const seed = fixture.seedResearchJob(700);
    const build = spawnSync("pnpm", ["research:worker:build"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);
    const binary = `${process.cwd()}/.stocksembly-verification/research-worker/leaseWorker.js`;
    const child = spawn(process.execPath, [
      binary,
      "--database",
      fixture.databasePath,
      "--owner",
      "signal-worker",
      "--verification-outcome",
      "wait-for-signal",
      "--serve",
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.on("data", () => {
          if (stdout.includes('"kind":"attempt_started"')) resolve();
        });
        child.once("error", reject);
      });
      const exited = new Promise<number | null>((resolve) => {
        child.once("exit", resolve);
      });

      // When
      child.kill("SIGTERM");
      const exitCode = await exited;
      const restart = spawnSync(
        process.execPath,
        [
          binary,
          "--database",
          fixture.databasePath,
          "--owner",
          "restart-worker",
          "--verification-outcome",
          "accepted",
          "--drain",
        ],
        { encoding: "utf8" },
      );

      // Then
      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain('"kind":"worker_stopped"');
      expect(restart.status, restart.stderr).toBe(0);
      expect(fixture.launches(seed.runId).map((row) => row.ordinal)).toEqual([
        1, 2,
      ]);
      expect(fixture.job(seed.jobId)).toMatchObject({
        status: "succeeded",
        lease_expires_at: null,
      });
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      fixture.cleanup();
    }
  });
}

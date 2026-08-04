import { describe, expect, it } from "vitest";
import { CodexRunnerError } from "../server/codex/codexErrors";
import { executeSpawn } from "../server/codex/codexProcess";
import { LEASE_ENGINE_DEFAULTS, WorkerCrashError } from "./leaseEngine";
import {
  createLeaseEngineFixture,
  RecordingHandler,
  uuid,
} from "./leaseEngine.testSupport";
import { registerLeaseEngineReviewTests } from "./leaseEngineReview.testCases";

describe("leased research worker", () => {
  registerLeaseEngineReviewTests();
  it("has exactly one lease winner when two workers poll the same queued job", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const first = fixture.openEngine("worker-a");
    const second = fixture.openEngine("worker-b");

    try {
      fixture.seedResearchJob(1);

      // When
      const results = await Promise.all([first.poll(), second.poll()]);

      // Then
      expect(
        results.filter((result) => result.kind === "handled"),
      ).toHaveLength(1);
      expect(fixture.launches()).toHaveLength(1);
      const seed = fixture.seedResearchJob(2);
      await first.poll();
      expect(fixture.eventCount(seed.runId, "attempt_committed")).toBe(1);
    } finally {
      await Promise.all([first.shutdown(), second.shutdown()]);
      fixture.cleanup();
    }
  });

  it("terminalizes failed runs so later queued research can start", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    fixture.handler.outcome = { kind: "permanent", code: "fixture_failure" };
    const engine = fixture.openEngine("worker-terminal");
    const first = fixture.seedResearchJob(101);
    const second = fixture.seedResearchJob(102);
    const third = fixture.seedResearchJob(103);

    try {
      // When
      const results = [
        await engine.poll(),
        await engine.poll(),
        await engine.poll(),
      ];

      // Then
      expect(results.every((result) => result.kind === "handled")).toBe(true);
      expect(fixture.runStatus(first.runId)).toBe("failed");
      expect(fixture.runStatus(second.runId)).toBe("failed");
      expect(fixture.runStatus(third.runId)).toBe("failed");
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("terminalizes an unexpected handler failure instead of stopping the worker", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("worker-unexpected-failure", {
      run: async () => {
        throw new TypeError("unexpected stage failure");
      },
    });
    const seed = fixture.seedResearchJob(114);

    try {
      // When
      const result = await engine.poll();

      // Then
      expect(result).toMatchObject({
        kind: "handled",
        outcome: {
          kind: "permanent",
          code: "unexpected_worker_failure:TypeError",
        },
      });
      expect(fixture.runStatus(seed.runId)).toBe("failed");
      expect(fixture.eventCount(seed.runId, "run_failed")).toBe(1);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("terminalizes a run after its final sibling finishes behind an incomplete attempt", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("worker-incomplete");
    const [first] = fixture.seedResearchJobs(2, 104);
    if (first === undefined) throw new RangeError("research fixture missing");

    try {
      // When
      fixture.handler.outcome = { kind: "incomplete", code: "source_missing" };
      await engine.poll();
      fixture.handler.outcome = { kind: "accepted" };
      await engine.poll();

      // Then
      expect(fixture.runStatus(first.runId)).toBe("incomplete");
      expect(fixture.eventCount(first.runId, "run_incomplete")).toBe(1);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("repairs a running run whose research jobs ended without a terminal event", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("worker-reconcile");
    const [first] = fixture.seedResearchJobs(2, 105);
    if (first === undefined) throw new RangeError("research fixture missing");
    fixture.failResearchJobsWithoutTerminalEvent(first.runId);

    try {
      // When
      await engine.poll();

      // Then
      expect(fixture.runStatus(first.runId)).toBe("incomplete");
      expect(fixture.eventCount(first.runId, "run_incomplete")).toBe(1);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("extends a 30-second lease at the 10-second heartbeat", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const handler = new RecordingHandler();
    let release: (() => void) | undefined;
    handler.gate = new Promise((resolve) => {
      release = resolve;
    });
    const engine = fixture.openEngine("worker-heartbeat", handler);
    const seed = fixture.seedResearchJob(3);

    try {
      // When
      const task = engine.poll();
      fixture.clock.set("2026-07-22T00:00:10.000Z");
      const extended = engine.heartbeat();

      // Then
      expect(extended).toBe(1);
      expect(fixture.job(seed.jobId).lease_expires_at).toBe(
        "2026-07-22T00:00:40.000Z",
      );
      release?.();
      await task;
    } finally {
      release?.();
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("keeps an active model leased beyond three minutes of fake-clock time", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    let reportActivity: (() => void) | undefined;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const engine = fixture.openEngine("long-active-worker", {
      run: async (_attempt, _signal, activity) => {
        reportActivity = activity;
        await gate;
        return { kind: "accepted" };
      },
    });
    const seed = fixture.seedResearchJob(113);
    const task = engine.poll();

    try {
      // When
      for (let seconds = 10; seconds <= 190; seconds += 10) {
        fixture.clock.set(
          new Date(
            Date.parse("2026-07-22T00:00:00.000Z") + seconds * 1_000,
          ).toISOString(),
        );
        reportActivity?.();
        expect(engine.heartbeat()).toBe(1);
      }
      release?.();
      const result = await task;

      // Then
      expect(result).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
      expect(fixture.job(seed.jobId).status).toBe("succeeded");
    } finally {
      release?.();
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("reclaims an expired lease with a higher fencing token", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("worker-reclaimer");
    const seed = fixture.seedResearchJob(4);
    fixture.leaseOnly(seed.jobId, "dead-worker", "2026-07-22T00:00:30.000Z");

    try {
      // When
      fixture.clock.set("2026-07-22T00:00:30.000Z");
      const result = await engine.poll();

      // Then
      expect(result.kind).toBe("handled");
      expect(fixture.job(seed.jobId).lease_token).toBe(2);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("burns a crashed research ordinal and creates one new-ordinal replacement", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const crashing = fixture.openEngine("worker-crash", {
      run: async () => {
        throw new WorkerCrashError("killed after spawn reservation");
      },
    });
    const seed = fixture.seedResearchJob(5);

    try {
      const crashed = await crashing.poll();
      const firstAttempt =
        crashed.kind === "crashed" ? crashed.attempt : undefined;
      fixture.clock.set("2026-07-22T00:00:31.000Z");
      const replacement = fixture.openEngine("worker-replacement");

      // When
      const recovered = replacement.recoverExpired();
      const result = await replacement.poll();

      // Then
      expect(recovered).toEqual([firstAttempt?.attemptId]);
      expect(result.kind).toBe("handled");
      expect(
        fixture.launches(seed.runId).map((launch) => launch.ordinal),
      ).toEqual([1, 2]);
      expect(fixture.attempt(firstAttempt?.attemptId ?? "")).toMatchObject({
        status: "unknown",
        outcome: "unknown",
      });
      await replacement.shutdown();
    } finally {
      await crashing.shutdown();
      fixture.cleanup();
    }
  });

  it("treats repeated expired-attempt recovery as transient instead of exhausting artifact repair", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const crashing = fixture.openEngine("worker-crash-loop", {
      run: async () => {
        throw new WorkerCrashError("worker stopped after spawn reservation");
      },
    });
    const seed = fixture.seedResearchJob(115);

    try {
      await crashing.poll();
      fixture.clock.set("2026-07-22T00:00:31.000Z");
      crashing.recoverExpired();
      await crashing.poll();
      fixture.clock.set("2026-07-22T00:01:02.000Z");
      crashing.recoverExpired();
      const replacement = fixture.openEngine("worker-recovered", {
        run: async () => ({ kind: "accepted" }),
      });

      // When
      const result = await replacement.poll();

      // Then
      expect(result).toMatchObject({ kind: "handled", committed: true });
      expect(fixture.runStatus(seed.runId)).toBe("running");
      expect(
        fixture.launches(seed.runId).map((launch) => launch.ordinal),
      ).toEqual([1, 2, 3]);
      await replacement.shutdown();
    } finally {
      await crashing.shutdown();
      fixture.cleanup();
    }
  });

  it("terminalizes an uncertain Q&A attempt and never relaunches it", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const crashing = fixture.openEngine("qa-crash", {
      run: async () => {
        throw new WorkerCrashError("killed after Q&A spawn");
      },
    });
    const seed = fixture.seedQuestionJob(6);

    try {
      await crashing.poll();
      fixture.clock.set("2026-07-22T00:00:31.000Z");
      const replacement = fixture.openEngine("qa-recovery");

      // When
      replacement.recoverExpired();
      const result = await replacement.poll();

      // Then
      expect(result).toEqual({ kind: "idle" });
      expect(fixture.questionStatus(seed.questionId)).toBe("failed");
      expect(fixture.questionLaunches()).toBe(1);
      await replacement.shutdown();
    } finally {
      await crashing.shutdown();
      fixture.cleanup();
    }
  });

  it("reserves each queued Q&A job against its own question lease", async () => {
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("qa-sequential");
    const first = fixture.seedQuestionJob(61);
    const second = fixture.seedQuestionJob(62);

    try {
      const results = [await engine.poll(), await engine.poll()];

      expect(results).toEqual([
        expect.objectContaining({ kind: "handled", committed: true }),
        expect.objectContaining({ kind: "handled", committed: true }),
      ]);
      expect(fixture.questionStatus(first.questionId)).toBe("failed");
      expect(fixture.questionStatus(second.questionId)).toBe("failed");
      expect(fixture.questionLaunches()).toBe(2);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("fences a late duplicate commit after expiry recovery", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const late = new RecordingHandler();
    let release: (() => void) | undefined;
    late.gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = fixture.openEngine("late-worker", late);
    const seed = fixture.seedResearchJob(7);

    try {
      const lateTask = first.poll();
      fixture.clock.set("2026-07-22T00:00:31.000Z");
      const winner = fixture.openEngine("winner");
      winner.recoverExpired();

      // When
      const accepted = await winner.poll();
      release?.();
      const stale = await lateTask;

      // Then
      expect(accepted).toMatchObject({ kind: "handled", committed: true });
      expect(stale).toMatchObject({ kind: "handled", committed: false });
      expect(fixture.eventCount(seed.runId, "attempt_committed")).toBe(1);
      await winner.shutdown();
    } finally {
      release?.();
      await first.shutdown();
      fixture.cleanup();
    }
  });

  it("persists retry-wait backoff across database reopen", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    fixture.handler.outcome = {
      kind: "transient",
      retryAt: "2026-07-22T00:00:20.000Z",
    };
    const first = fixture.openEngine("retry-worker");
    const seed = fixture.seedResearchJob(8);
    await first.poll();
    await first.shutdown();
    const reopened = fixture.openEngine("reopened-worker", {
      run: async () => ({ kind: "accepted" }),
    });

    try {
      // When
      fixture.clock.set("2026-07-22T00:00:19.000Z");
      const early = await reopened.poll();
      fixture.clock.set("2026-07-22T00:00:20.000Z");
      const due = await reopened.poll();

      // Then
      expect(early).toEqual({ kind: "idle" });
      expect(due.kind).toBe("handled");
      expect(
        fixture.launches(seed.runId).map((launch) => launch.ordinal),
      ).toEqual([1, 2]);
    } finally {
      await reopened.shutdown();
      fixture.cleanup();
    }
  });

  it("charges a transient runner retry to the bounded physical retry budget", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    let launches = 0;
    const engine = fixture.openEngine(
      "classified-retry-worker",
      {
        run: async () => {
          launches += 1;
          if (launches === 1) throw new CodexRunnerError("process_failed");
          return { kind: "accepted" };
        },
      },
      { retryRandom: () => 0.5 },
    );
    const seed = fixture.seedResearchJob(108);

    try {
      // When
      const failed = await engine.poll();
      fixture.clock.set("2026-07-22T00:00:05.000Z");
      const recovered = await engine.poll();

      // Then
      expect(failed).toMatchObject({
        kind: "handled",
        outcome: { kind: "transient", code: "codex_process_failed" },
      });
      expect(recovered).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
      expect(fixture.budgets(seed.runId).requestedReplacementCalls).toBe(4);
      expect(fixture.runtimeStates(seed.runId)).toEqual([
        "waiting",
        "retrying",
      ]);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("opens a recoverable circuit after repeated transient runner failures", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    let dependencyAvailable = false;
    const engine = fixture.openEngine(
      "circuit-worker",
      {
        run: async () => {
          if (!dependencyAvailable)
            throw new CodexRunnerError("network_unavailable", {
              process: {
                exitCode: 17,
                signal: null,
                stdoutBytes: 29,
                stderrBytes: 41,
                durationMs: 73,
              },
            });
          return { kind: "accepted" };
        },
      },
      { retryRandom: () => 0.5 },
    );
    const seed = fixture.seedResearchJob(109);

    try {
      await engine.poll();
      fixture.clock.set("2026-07-22T00:00:05.000Z");

      // When
      const opened = await engine.poll();
      fixture.clock.set("2026-07-22T01:00:00.000Z");
      const held = await engine.poll();
      dependencyAvailable = true;
      engine.recoverCircuit(seed.runId);
      const recovered = await engine.poll();

      // Then
      expect(opened).toMatchObject({
        kind: "handled",
        outcome: {
          kind: "attention",
          code: "external_dependency_circuit_open",
        },
      });
      expect(held).toEqual({ kind: "idle" });
      expect(recovered).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
      expect(fixture.runtimeStates(seed.runId)).toContain(
        "blocked-external-dependency",
      );
      const persisted = JSON.stringify(
        fixture.attemptCommittedPayloads(seed.runId),
      );
      expect(persisted).toContain(
        '"process":{"exitCode":17,"signal":null,"stdoutBytes":29,"stderrBytes":41,"durationMs":73}',
      );
      expect(persisted).not.toContain("SECRET");
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("persists only stable readiness diagnostics for a blocked launch", async () => {
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("readiness-diagnostic-worker", {
      run: async () => ({
        kind: "transient",
        code: "codex_isolation_temporarily_unavailable",
        retryAt: fixture.clock.now(),
        readiness: { check: "login", reason: "login_probe" },
      }),
    });
    const seed = fixture.seedResearchJob(113);

    try {
      await engine.poll();

      expect(
        fixture.eventPayload(seed.runId, "attempt_committed"),
      ).toMatchObject({
        classification: "transient",
        code: "codex_isolation_temporarily_unavailable",
        readiness: { check: "login", reason: "login_probe" },
      });
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("never retries permanent auth failures and exposes external attention", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("auth-worker", {
      run: async () => {
        throw new CodexRunnerError("auth_unavailable");
      },
    });
    const seed = fixture.seedResearchJob(110);

    try {
      // When
      const result = await engine.poll();
      fixture.clock.set("2026-07-22T01:00:00.000Z");
      const later = await engine.poll();

      // Then
      expect(result).toMatchObject({
        kind: "handled",
        outcome: { kind: "permanent", code: "codex_auth_unavailable" },
      });
      expect(later).toEqual({ kind: "idle" });
      expect(fixture.runtimeStates(seed.runId)).toEqual([
        "blocked-external-dependency",
      ]);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("honors a provider retry time for rate-limited runner failures", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    let limited = true;
    const retryAt = "2026-07-22T00:02:00.000Z";
    const engine = fixture.openEngine("rate-worker", {
      run: async () => {
        if (limited) throw new CodexRunnerError("rate_limited", { retryAt });
        return { kind: "accepted" };
      },
    });
    fixture.seedResearchJob(114);

    try {
      // When
      const limitedResult = await engine.poll();
      fixture.clock.set("2026-07-22T00:01:59.999Z");
      const early = await engine.poll();
      limited = false;
      fixture.clock.set(retryAt);
      const due = await engine.poll();

      // Then
      expect(limitedResult).toMatchObject({
        kind: "handled",
        outcome: { kind: "transient", retryAt },
      });
      expect(early).toEqual({ kind: "idle" });
      expect(due).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("keeps invalid model output resumable as a budgeted repair", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    let repaired = false;
    const engine = fixture.openEngine(
      "repair-worker",
      {
        run: async () => {
          if (!repaired) throw new CodexRunnerError("output_invalid");
          return { kind: "accepted" };
        },
      },
      { retryRandom: () => 0.5 },
    );
    const seed = fixture.seedResearchJob(111);

    try {
      // When
      const result = await engine.poll();
      repaired = true;
      fixture.clock.set("2026-07-22T00:00:05.000Z");
      const resumed = await engine.poll();

      // Then
      expect(result).toMatchObject({
        kind: "handled",
        outcome: { kind: "repair", code: "invalid_model_output" },
      });
      expect(resumed).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
      expect(fixture.job(seed.jobId).status).toBe("succeeded");
      expect(fixture.budgets(seed.runId).requestedReplacementCalls).toBe(4);
      expect(fixture.runtimeStates(seed.runId)).toEqual([
        "invalid-model-output",
        "retrying",
      ]);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("retries one forbidden tool event as a bounded model repair", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    let repaired = false;
    const engine = fixture.openEngine("tool-event-repair-worker", {
      run: async () => {
        if (!repaired) throw new CodexRunnerError("tool_event");
        return { kind: "accepted" };
      },
    });
    const seed = fixture.seedResearchJob(111);

    try {
      // When
      const first = await engine.poll();
      repaired = true;
      const second = await engine.poll();

      // Then
      expect(first).toMatchObject({
        kind: "handled",
        outcome: { kind: "repair", code: "forbidden_tool_event" },
      });
      expect(second).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
      expect(fixture.job(seed.jobId).status).toBe("succeeded");
      expect(fixture.launches(seed.runId)).toHaveLength(2);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("exposes publication failure separately from invalid model output", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("publication-worker", {
      run: async () => ({
        kind: "incomplete",
        code: "report_publication_failed:fence_mismatch",
      }),
    });
    const seed = fixture.seedResearchJob(115);

    try {
      // When
      await engine.poll();

      // Then
      expect(fixture.runtimeStates(seed.runId)).toEqual([
        "publication-failure",
      ]);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("stops extending a silent attempt after ten minutes without activity", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    let cancelled = false;
    const engine = fixture.openEngine("silent-worker", {
      run: async (_attempt, signal) =>
        await new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              cancelled = true;
              resolve({ kind: "incomplete", code: "cancelled" });
            },
            { once: true },
          );
        }),
    });
    fixture.seedResearchJob(112);
    const task = engine.poll();

    try {
      // When
      fixture.clock.set("2026-07-22T00:10:00.001Z");
      const extended = engine.heartbeat();
      await task;

      // Then
      expect(extended).toBe(0);
      expect(cancelled).toBe(true);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("holds the cross-worker Codex concurrency ceiling at six", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const handler = new RecordingHandler();
    let release: (() => void) | undefined;
    handler.gate = new Promise((resolve) => {
      release = resolve;
    });
    fixture.seedResearchJobs(7, 9);
    const engines = ["a", "b", "c", "d", "e", "f", "g"].map((id) =>
      fixture.openEngine(`worker-${id}`, handler),
    );

    try {
      // When
      const tasks = engines.map((engine) => engine.poll());
      const seventh = await tasks[6];

      // Then
      expect(fixture.launches()).toHaveLength(6);
      expect(seventh).toEqual({ kind: "capacity" });
      release?.();
      await Promise.all(tasks);
    } finally {
      release?.();
      await Promise.all(engines.map((engine) => engine.shutdown()));
      fixture.cleanup();
    }
  });

  it("reports the default two-active/eight-queued admission capacity", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("capacity-worker");
    for (let index = 0; index < LEASE_ENGINE_DEFAULTS.queuedRuns; index += 1)
      fixture.seedResearchJob(20 + index);

    try {
      // When
      const capacity = engine.capacity();

      // Then
      expect(LEASE_ENGINE_DEFAULTS.activeRuns).toBe(2);
      expect(capacity.queuedRuns).toBe(8);
      expect(capacity.acceptsRun).toBe(false);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("never reserves more than 25 mandatory first-attempt launches", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("budget-worker");
    const jobs = fixture.seedResearchJobs(31, 40);

    try {
      // When
      const results = [];
      for (let ordinal = 1; ordinal <= 30; ordinal += 1)
        results.push(await engine.poll());
      const overBudget = await engine.poll();

      // Then
      expect(results.some((result) => result.kind === "incomplete")).toBe(true);
      expect(overBudget).toEqual({ kind: "idle" });
      expect(fixture.launches(jobs[0]?.runId)).toHaveLength(25);
      expect(fixture.run(jobs[0]?.runId ?? "")?.status).toBe("incomplete");
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("gracefully drains and reopens the same SQLite database", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const seed = fixture.seedResearchJob(80);
    const first = fixture.openEngine("before-restart");
    await first.poll();

    // When
    await first.shutdown();
    const reopened = fixture.openEngine("after-restart");

    try {
      // Then
      expect(await reopened.poll()).toEqual({ kind: "idle" });
      expect(fixture.launches(seed.runId)).toHaveLength(1);
    } finally {
      await reopened.shutdown();
      fixture.cleanup();
    }
  });

  it("aborts the active run and durably finalizes cancellation without an attempt commit", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    let observedAbort = false;
    const engine = fixture.openEngine("cancel-worker", {
      run: async (_attempt, signal) => {
        try {
          await executeSpawn({
            executable: process.execPath,
            argv: ["-e", "setInterval(()=>{},1000)"],
            cwd: process.cwd(),
            environment: { PATH: "/usr/bin:/bin" },
            stdin: "",
            timeoutMs: 30_000,
            killGraceMs: 5_000,
            signal,
          });
          return { kind: "accepted" };
        } catch (error) {
          if (error instanceof CodexRunnerError && error.code === "cancelled") {
            observedAbort = true;
            return { kind: "incomplete", code: "cancelled" };
          }
          throw error;
        }
      },
    });
    const seed = fixture.seedResearchJob(90);
    const active = engine.poll();

    try {
      // When
      const cancelled = await engine.cancel(seed.runId);
      const staleCommit = await active;

      // Then
      expect(cancelled.kind).toBe("cancelled");
      expect(observedAbort).toBe(true);
      expect(staleCommit).toMatchObject({ kind: "handled", committed: false });
      expect(fixture.run(seed.runId)?.status).toBe("cancelled");
      expect(fixture.job(seed.jobId).status).toBe("cancelled");
      expect(
        fixture.launches(seed.runId).map((launch) => launch.ordinal),
      ).toEqual([1]);
      expect(fixture.eventCount(seed.runId, "attempt_committed")).toBe(0);
      expect(fixture.run(seed.runId)?.reportId).toBeUndefined();
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("atomically cancels a leased job before an attempt is reserved", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("lease-canceller");
    const seed = fixture.seedResearchJob(93);
    fixture.leaseOnly(seed.jobId, "lease-owner", "2026-07-22T00:00:30.000Z");

    try {
      // When
      const cancellation = await engine.cancel(seed.runId);

      // Then
      expect(cancellation).toEqual({ kind: "cancelled" });
      expect(fixture.run(seed.runId)?.status).toBe("cancelled");
      expect(fixture.job(seed.jobId)).toMatchObject({
        status: "cancelled",
        lease_expires_at: null,
      });
      expect(fixture.launches(seed.runId)).toHaveLength(0);
      expect(fixture.eventCount(seed.runId, "run_cancelled")).toBe(1);
      expect(fixture.run(seed.runId)?.reportId).toBeUndefined();
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("terminalizes the actual reservation path before spawn when requested work exceeds 34", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const handler = new RecordingHandler();
    const engine = fixture.openEngine("budget-preflight", handler);
    const seed = fixture.seedResearchJob(91, {
      remainingBaseCalls: 26,
      requestedOptionalCalls: 3,
      requestedReplacementCalls: 6,
    });

    try {
      // When
      const result = await engine.poll();

      // Then
      expect(result).toEqual({ kind: "incomplete" });
      expect(handler.attempts).toHaveLength(0);
      expect(fixture.launches(seed.runId)).toHaveLength(0);
      expect(fixture.run(seed.runId)?.status).toBe("incomplete");
      expect(fixture.limitations(seed.runId)).toEqual([
        "physical_launch_budget_exhausted",
      ]);
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });

  it("keeps a terminal commit immutable when commit wins the cancellation race", async () => {
    // Given
    const fixture = createLeaseEngineFixture();
    const engine = fixture.openEngine("commit-winner");
    const seed = fixture.seedResearchJob(92);

    try {
      await engine.poll();
      fixture.completeRun(seed.runId, uuid(990_001));

      // When
      const cancellation = await engine.cancel(seed.runId);

      // Then
      expect(cancellation).toEqual({ kind: "terminal_immutable" });
      expect(fixture.run(seed.runId)?.status).toBe("completed");
    } finally {
      await engine.shutdown();
      fixture.cleanup();
    }
  });
});

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
    const fixture = await createLeaseEngineFixture();
    const first = fixture.openEngine("worker-a");
    const second = fixture.openEngine("worker-b");

    try {
      await fixture.seedResearchJob(1);

      // When
      const results = await Promise.all([first.poll(), second.poll()]);

      // Then
      expect(
        results.filter((result) => result.kind === "handled"),
      ).toHaveLength(1);
      expect(await fixture.launches()).toHaveLength(1);
      const seed = await fixture.seedResearchJob(2);
      await first.poll();
      expect(await fixture.eventCount(seed.runId, "attempt_committed")).toBe(1);
    } finally {
      await Promise.all([first.shutdown(), second.shutdown()]);
      await fixture.cleanup();
    }
  });

  it("terminalizes failed runs so later queued research can start", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    fixture.handler.outcome = { kind: "permanent", code: "fixture_failure" };
    const engine = fixture.openEngine("worker-terminal");
    const first = await fixture.seedResearchJob(101);
    const second = await fixture.seedResearchJob(102);
    const third = await fixture.seedResearchJob(103);

    try {
      // When
      const results = [
        await engine.poll(),
        await engine.poll(),
        await engine.poll(),
      ];

      // Then
      expect(results.every((result) => result.kind === "handled")).toBe(true);
      expect(await fixture.runStatus(first.runId)).toBe("failed");
      expect(await fixture.runStatus(second.runId)).toBe("failed");
      expect(await fixture.runStatus(third.runId)).toBe("failed");
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("terminalizes an unexpected handler failure instead of stopping the worker", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("worker-unexpected-failure", {
      run: async () => {
        throw new TypeError("unexpected stage failure");
      },
    });
    const seed = await fixture.seedResearchJob(114);

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
      expect(await fixture.runStatus(seed.runId)).toBe("failed");
      expect(await fixture.eventCount(seed.runId, "run_failed")).toBe(1);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("terminalizes a run after its final sibling finishes behind an incomplete attempt", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("worker-incomplete");
    const [first] = await fixture.seedResearchJobs(2, 104);
    if (first === undefined) throw new RangeError("research fixture missing");

    try {
      // When
      fixture.handler.outcome = { kind: "incomplete", code: "source_missing" };
      await engine.poll();
      fixture.handler.outcome = { kind: "accepted" };
      await engine.poll();

      // Then
      expect(await fixture.runStatus(first.runId)).toBe("incomplete");
      expect(await fixture.eventCount(first.runId, "run_incomplete")).toBe(1);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("repairs a running run whose research jobs ended without a terminal event", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("worker-reconcile");
    const [first] = await fixture.seedResearchJobs(2, 105);
    if (first === undefined) throw new RangeError("research fixture missing");
    await fixture.failResearchJobsWithoutTerminalEvent(first.runId);

    try {
      // When
      await engine.poll();

      // Then
      expect(await fixture.runStatus(first.runId)).toBe("incomplete");
      expect(await fixture.eventCount(first.runId, "run_incomplete")).toBe(1);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("extends a 30-second lease at the 10-second heartbeat", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const handler = new RecordingHandler();
    let release: (() => void) | undefined;
    handler.gate = new Promise((resolve) => {
      release = resolve;
    });
    const engine = fixture.openEngine("worker-heartbeat", handler);
    const seed = await fixture.seedResearchJob(3);

    try {
      // When
      const task = engine.poll();
      await fixture.waitForStarts();
      fixture.clock.set("2026-07-22T00:00:10.000Z");
      const extended = await engine.heartbeat();

      // Then
      expect(extended).toBe(1);
      expect((await fixture.job(seed.jobId)).lease_expires_at).toBe(
        "2026-07-22T00:00:40.000Z",
      );
      release?.();
      await task;
    } finally {
      release?.();
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("keeps an active model leased beyond three minutes of fake-clock time", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
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
    const seed = await fixture.seedResearchJob(113);
    const task = engine.poll();
    await fixture.waitForStarts();

    try {
      // When
      for (let seconds = 10; seconds <= 190; seconds += 10) {
        fixture.clock.set(
          new Date(
            Date.parse("2026-07-22T00:00:00.000Z") + seconds * 1_000,
          ).toISOString(),
        );
        reportActivity?.();
        expect(await engine.heartbeat()).toBe(1);
      }
      release?.();
      const result = await task;

      // Then
      expect(result).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
      expect((await fixture.job(seed.jobId)).status).toBe("succeeded");
    } finally {
      release?.();
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("reclaims an expired lease with a higher fencing token", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("worker-reclaimer");
    const seed = await fixture.seedResearchJob(4);
    await fixture.leaseOnly(
      seed.jobId,
      "dead-worker",
      "2026-07-22T00:00:30.000Z",
    );

    try {
      // When
      fixture.clock.set("2026-07-22T00:00:30.000Z");
      const result = await engine.poll();

      // Then
      expect(result.kind).toBe("handled");
      expect((await fixture.job(seed.jobId)).lease_token).toBe(2);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("burns a crashed research ordinal and creates one new-ordinal replacement", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const crashing = fixture.openEngine("worker-crash", {
      run: async () => {
        throw new WorkerCrashError("killed after spawn reservation");
      },
    });
    const seed = await fixture.seedResearchJob(5);

    try {
      const crashed = await crashing.poll();
      const firstAttempt =
        crashed.kind === "crashed" ? crashed.attempt : undefined;
      fixture.clock.set("2026-07-22T00:00:31.000Z");
      const replacement = fixture.openEngine("worker-replacement");

      // When
      const recovered = await replacement.recoverExpired();
      const result = await replacement.poll();

      // Then
      expect(recovered).toEqual([firstAttempt?.attemptId]);
      expect(result.kind).toBe("handled");
      expect(
        (await fixture.launches(seed.runId)).map((launch) => launch.ordinal),
      ).toEqual([1, 2]);
      expect(
        await fixture.attempt(firstAttempt?.attemptId ?? ""),
      ).toMatchObject({
        status: "unknown",
        outcome: "unknown",
      });
      await replacement.shutdown();
    } finally {
      await crashing.shutdown();
      await fixture.cleanup();
    }
  });

  it("treats repeated expired-attempt recovery as transient instead of exhausting artifact repair", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const crashing = fixture.openEngine("worker-crash-loop", {
      run: async () => {
        throw new WorkerCrashError("worker stopped after spawn reservation");
      },
    });
    const seed = await fixture.seedResearchJob(115);

    try {
      await crashing.poll();
      fixture.clock.set("2026-07-22T00:00:31.000Z");
      await crashing.recoverExpired();
      await crashing.poll();
      fixture.clock.set("2026-07-22T00:01:02.000Z");
      await crashing.recoverExpired();
      const replacement = fixture.openEngine("worker-recovered", {
        run: async () => ({ kind: "accepted" }),
      });

      // When
      const result = await replacement.poll();

      // Then
      expect(result).toMatchObject({ kind: "handled", committed: true });
      expect(await fixture.runStatus(seed.runId)).toBe("running");
      expect(
        (await fixture.launches(seed.runId)).map((launch) => launch.ordinal),
      ).toEqual([1, 2, 3]);
      await replacement.shutdown();
    } finally {
      await crashing.shutdown();
      await fixture.cleanup();
    }
  });

  it("terminalizes an uncertain Q&A attempt and never relaunches it", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const crashing = fixture.openEngine("qa-crash", {
      run: async () => {
        throw new WorkerCrashError("killed after Q&A spawn");
      },
    });
    const seed = await fixture.seedQuestionJob(6);

    try {
      await crashing.poll();
      fixture.clock.set("2026-07-22T00:00:31.000Z");
      const replacement = fixture.openEngine("qa-recovery");

      // When
      await replacement.recoverExpired();
      const result = await replacement.poll();

      // Then
      expect(result).toEqual({ kind: "idle" });
      expect(await fixture.questionStatus(seed.questionId)).toBe("failed");
      expect(await fixture.questionLaunches()).toBe(1);
      await replacement.shutdown();
    } finally {
      await crashing.shutdown();
      await fixture.cleanup();
    }
  });

  it("reserves each queued Q&A job against its own question lease", async () => {
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("qa-sequential");
    const first = await fixture.seedQuestionJob(61);
    const second = await fixture.seedQuestionJob(62);

    try {
      const results = [await engine.poll(), await engine.poll()];

      expect(results).toEqual([
        expect.objectContaining({ kind: "handled", committed: true }),
        expect.objectContaining({ kind: "handled", committed: true }),
      ]);
      expect(await fixture.questionStatus(first.questionId)).toBe("failed");
      expect(await fixture.questionStatus(second.questionId)).toBe("failed");
      expect(await fixture.questionLaunches()).toBe(2);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("fences a late duplicate commit after expiry recovery", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const late = new RecordingHandler();
    let release: (() => void) | undefined;
    late.gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = fixture.openEngine("late-worker", late);
    const seed = await fixture.seedResearchJob(7);

    try {
      const lateTask = first.poll();
      await fixture.waitForStarts();
      fixture.clock.set("2026-07-22T00:00:31.000Z");
      const winner = fixture.openEngine("winner");
      await winner.recoverExpired();

      // When
      const accepted = await winner.poll();
      release?.();
      const stale = await lateTask;

      // Then
      expect(accepted).toMatchObject({ kind: "handled", committed: true });
      expect(stale).toMatchObject({ kind: "handled", committed: false });
      expect(await fixture.eventCount(seed.runId, "attempt_committed")).toBe(1);
      await winner.shutdown();
    } finally {
      release?.();
      await first.shutdown();
      await fixture.cleanup();
    }
  });

  it("persists retry-wait backoff across database reopen", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    fixture.handler.outcome = {
      kind: "transient",
      retryAt: "2026-07-22T00:00:20.000Z",
    };
    const first = fixture.openEngine("retry-worker");
    const seed = await fixture.seedResearchJob(8);
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
        (await fixture.launches(seed.runId)).map((launch) => launch.ordinal),
      ).toEqual([1, 2]);
    } finally {
      await reopened.shutdown();
      await fixture.cleanup();
    }
  });

  it("charges a transient runner retry to the bounded physical retry budget", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
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
    const seed = await fixture.seedResearchJob(108);

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
      expect(await fixture.runStatus(seed.runId)).toBe("running");
      expect(
        (await fixture.budgets(seed.runId)).requestedReplacementCalls,
      ).toBe(12);
      expect(await fixture.runtimeStates(seed.runId)).toEqual([
        "waiting",
        "retrying",
      ]);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("continues later work after transient retries while actual launches remain below the cap", async () => {
    const fixture = await createLeaseEngineFixture();
    let firstJobLaunches = 0;
    const jobs = await fixture.seedResearchJobs(2, 118, {
      remainingBaseCalls: 25,
      requestedOptionalCalls: 3,
      requestedReplacementCalls: 12,
    });
    const engine = fixture.openEngine(
      "full-budget-transient-worker",
      {
        run: async (attempt) => {
          if (attempt.jobId === jobs[0]!.jobId && firstJobLaunches < 2) {
            firstJobLaunches += 1;
            throw new CodexRunnerError("process_failed");
          }
          return { kind: "accepted" };
        },
      },
      { retryRandom: () => 0.5 },
    );

    try {
      await engine.poll();
      fixture.clock.set("2026-07-22T00:00:05.000Z");
      await engine.poll();
      fixture.clock.set("2026-07-22T00:00:15.000Z");
      const firstAccepted = await engine.poll();
      const laterWork = await engine.poll();

      expect(firstAccepted).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
      expect(laterWork).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
      expect(await fixture.launches(jobs[0]!.runId)).toHaveLength(4);
      expect(await fixture.runStatus(jobs[0]!.runId)).toBe("running");
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("keeps repeated transient runner failures in durable automatic retry", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
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
    const seed = await fixture.seedResearchJob(109);

    try {
      await engine.poll();
      fixture.clock.set("2026-07-22T00:00:05.000Z");

      // When
      const secondFailure = await engine.poll();
      fixture.clock.set("2026-07-22T01:00:00.000Z");
      const coolingDown = await engine.poll();
      dependencyAvailable = true;
      fixture.clock.set("2026-07-22T01:10:00.000Z");
      const recovered = await engine.poll();

      // Then
      expect(secondFailure).toMatchObject({
        kind: "handled",
        outcome: {
          kind: "transient",
          code: "codex_network_unavailable",
        },
      });
      expect(coolingDown).toMatchObject({
        kind: "handled",
        outcome: {
          kind: "attention",
          code: "external_dependency_cooling_down",
        },
      });
      expect(recovered).toMatchObject({
        kind: "handled",
        outcome: { kind: "accepted" },
      });
      expect(await fixture.runtimeStates(seed.runId)).toContain("waiting");
      expect(await fixture.runtimeStates(seed.runId)).not.toContain(
        "blocked-external-dependency",
      );
      const persisted = JSON.stringify(
        await fixture.attemptCommittedPayloads(seed.runId),
      );
      expect(persisted).toContain(
        '"process":{"exitCode":17,"signal":null,"stdoutBytes":29,"stderrBytes":41,"durationMs":73}',
      );
      expect(persisted).not.toContain("SECRET");
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("reopens a cooling-down research job and resumes it from the same PostgreSQL state", async () => {
    const fixture = await createLeaseEngineFixture();
    const unavailable = fixture.openEngine(
      "cooldown-before-restart",
      {
        run: async () => {
          throw new CodexRunnerError("network_unavailable");
        },
      },
      { retryRandom: () => 0.5 },
    );
    const seed = await fixture.seedResearchJob(116);

    try {
      await unavailable.poll();
      fixture.clock.set("2026-07-22T00:00:05.000Z");
      await unavailable.poll();
      fixture.clock.set("2026-07-22T00:00:15.000Z");
      const coolingDown = await unavailable.poll();
      expect(coolingDown).toMatchObject({
        kind: "handled",
        outcome: { kind: "attention" },
      });
      await unavailable.shutdown();

      fixture.clock.set("2026-07-22T00:00:40.000Z");
      const reopened = fixture.openEngine("cooldown-after-restart", {
        run: async () => ({ kind: "accepted" }),
      });
      try {
        expect(await reopened.poll()).toMatchObject({
          kind: "handled",
          outcome: { kind: "accepted" },
        });
        expect((await fixture.job(seed.jobId)).status).toBe("succeeded");
      } finally {
        await reopened.shutdown();
      }
    } finally {
      await unavailable.shutdown();
      await fixture.cleanup();
    }
  });

  it("persists only stable readiness diagnostics for a blocked launch", async () => {
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("readiness-diagnostic-worker", {
      run: async () => ({
        kind: "transient",
        code: "codex_isolation_temporarily_unavailable",
        retryAt: fixture.clock.now(),
        readiness: { check: "login", reason: "login_probe" },
      }),
    });
    const seed = await fixture.seedResearchJob(113);

    try {
      await engine.poll();

      expect(
        await fixture.eventPayload(seed.runId, "attempt_committed"),
      ).toMatchObject({
        classification: "transient",
        code: "codex_isolation_temporarily_unavailable",
        readiness: { check: "login", reason: "login_probe" },
      });
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("never retries permanent auth failures and exposes external attention", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("auth-worker", {
      run: async () => {
        throw new CodexRunnerError("auth_unavailable");
      },
    });
    const seed = await fixture.seedResearchJob(110);

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
      expect(await fixture.runtimeStates(seed.runId)).toEqual([
        "blocked-external-dependency",
      ]);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("honors a provider retry time for rate-limited runner failures", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    let limited = true;
    const retryAt = "2026-07-22T00:02:00.000Z";
    const engine = fixture.openEngine("rate-worker", {
      run: async () => {
        if (limited) throw new CodexRunnerError("rate_limited", { retryAt });
        return { kind: "accepted" };
      },
    });
    await fixture.seedResearchJob(114);

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
      await fixture.cleanup();
    }
  });

  it("keeps invalid model output resumable as a budgeted repair", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
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
    const seed = await fixture.seedResearchJob(111);

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
      expect((await fixture.job(seed.jobId)).status).toBe("succeeded");
      expect(
        (await fixture.budgets(seed.runId)).requestedReplacementCalls,
      ).toBe(11);
      expect(await fixture.runtimeStates(seed.runId)).toEqual([
        "invalid-model-output",
        "retrying",
      ]);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("retries one forbidden tool event as a bounded model repair", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    let repaired = false;
    const engine = fixture.openEngine("tool-event-repair-worker", {
      run: async () => {
        if (!repaired) throw new CodexRunnerError("tool_event");
        return { kind: "accepted" };
      },
    });
    const seed = await fixture.seedResearchJob(111);

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
      expect((await fixture.job(seed.jobId)).status).toBe("succeeded");
      expect(await fixture.launches(seed.runId)).toHaveLength(2);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("exposes publication failure separately from invalid model output", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("publication-worker", {
      run: async () => ({
        kind: "incomplete",
        code: "report_publication_failed:fence_mismatch",
      }),
    });
    const seed = await fixture.seedResearchJob(115);

    try {
      // When
      await engine.poll();

      // Then
      expect(await fixture.runtimeStates(seed.runId)).toEqual([
        "publication-failure",
      ]);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("stops extending a silent attempt after ten minutes without activity", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
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
    await fixture.seedResearchJob(112);
    const task = engine.poll();
    await fixture.waitForStarts();

    try {
      // When
      fixture.clock.set("2026-07-22T00:10:00.001Z");
      const extended = await engine.heartbeat();
      await task;

      // Then
      expect(extended).toBe(0);
      expect(cancelled).toBe(true);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("shares twelve global slots fairly across workers and resumes overflow after release", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const handler = new RecordingHandler();
    let release: (() => void) | undefined;
    handler.gate = new Promise((resolve) => {
      release = resolve;
    });
    const groups = await Promise.all(
      [9, 10, 11, 12].map((id) => fixture.seedResearchJobs(4, id)),
    );
    const engines = Array.from({ length: 13 }, (_, id) =>
      fixture.openEngine(`worker-${id}`, handler),
    );

    try {
      // When
      const tasks = engines.map((engine) => engine.poll());
      const overflow = await Promise.race(tasks);
      await fixture.waitForStarts(12);

      // Then
      expect(await fixture.launches()).toHaveLength(12);
      expect(overflow).toEqual({ kind: "capacity" });
      for (const group of groups)
        expect(await fixture.launches(group[0]?.runId)).toHaveLength(3);
      release?.();
      await Promise.all(tasks);
      const resumed = await engines[0]?.poll();
      expect(resumed?.kind).toBe("handled");
      expect(await fixture.launches()).toHaveLength(13);
    } finally {
      release?.();
      await Promise.all(engines.map((engine) => engine.shutdown()));
      await fixture.cleanup();
    }
  });

  it("reports the ten-run maximum and fifty-run waiting capacity", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("capacity-worker");
    for (let index = 0; index < LEASE_ENGINE_DEFAULTS.queuedRuns; index += 1)
      await fixture.seedResearchJob(20 + index);

    try {
      // When
      const capacity = await engine.capacity();

      // Then
      expect(LEASE_ENGINE_DEFAULTS.activeRuns).toBe(10);
      expect(capacity.queuedRuns).toBe(50);
      expect(capacity.acceptsRun).toBe(false);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("never reserves more than 25 mandatory first-attempt launches", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("budget-worker");
    const jobs = await fixture.seedResearchJobs(31, 40);

    try {
      // When
      const results = [];
      for (let ordinal = 1; ordinal <= 30; ordinal += 1)
        results.push(await engine.poll());
      const overBudget = await engine.poll();

      // Then
      expect(results.some((result) => result.kind === "incomplete")).toBe(true);
      expect(overBudget).toEqual({ kind: "idle" });
      expect(await fixture.launches(jobs[0]?.runId)).toHaveLength(25);
      expect((await fixture.run(jobs[0]?.runId ?? ""))?.status).toBe(
        "incomplete",
      );
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("gracefully drains and reopens the same PostgreSQL database", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const seed = await fixture.seedResearchJob(80);
    const first = fixture.openEngine("before-restart");
    await first.poll();

    // When
    await first.shutdown();
    const reopened = fixture.openEngine("after-restart");

    try {
      // Then
      expect(await reopened.poll()).toEqual({ kind: "idle" });
      expect(await fixture.launches(seed.runId)).toHaveLength(1);
    } finally {
      await reopened.shutdown();
      await fixture.cleanup();
    }
  });

  it("aborts the active run and durably finalizes cancellation without an attempt commit", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
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
    const seed = await fixture.seedResearchJob(90);
    const active = engine.poll();
    await fixture.waitForStarts();

    try {
      // When
      const cancelled = await engine.cancel(seed.runId);
      const staleCommit = await active;

      // Then
      expect(cancelled.kind).toBe("cancelled");
      expect(observedAbort).toBe(true);
      expect(staleCommit).toMatchObject({ kind: "handled", committed: false });
      expect((await fixture.run(seed.runId))?.status).toBe("cancelled");
      expect((await fixture.job(seed.jobId)).status).toBe("cancelled");
      expect(
        (await fixture.launches(seed.runId)).map((launch) => launch.ordinal),
      ).toEqual([1]);
      expect(await fixture.eventCount(seed.runId, "attempt_committed")).toBe(0);
      expect((await fixture.run(seed.runId))?.reportId).toBeUndefined();
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("atomically cancels a leased job before an attempt is reserved", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("lease-canceller");
    const seed = await fixture.seedResearchJob(93);
    await fixture.leaseOnly(
      seed.jobId,
      "lease-owner",
      "2026-07-22T00:00:30.000Z",
    );

    try {
      // When
      const cancellation = await engine.cancel(seed.runId);

      // Then
      expect(cancellation).toEqual({ kind: "cancelled" });
      expect((await fixture.run(seed.runId))?.status).toBe("cancelled");
      expect(await fixture.job(seed.jobId)).toMatchObject({
        status: "cancelled",
        lease_expires_at: null,
      });
      expect(await fixture.launches(seed.runId)).toHaveLength(0);
      expect(await fixture.eventCount(seed.runId, "run_cancelled")).toBe(1);
      expect((await fixture.run(seed.runId))?.reportId).toBeUndefined();
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("terminalizes the actual reservation path before spawn when requested work exceeds 34", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const handler = new RecordingHandler();
    const engine = fixture.openEngine("budget-preflight", handler);
    const seed = await fixture.seedResearchJob(91, {
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
      expect(await fixture.launches(seed.runId)).toHaveLength(0);
      expect((await fixture.run(seed.runId))?.status).toBe("incomplete");
      expect(await fixture.limitations(seed.runId)).toEqual([
        "physical_launch_budget_exhausted",
      ]);
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });

  it("keeps a terminal commit immutable when commit wins the cancellation race", async () => {
    // Given
    const fixture = await createLeaseEngineFixture();
    const engine = fixture.openEngine("commit-winner");
    const seed = await fixture.seedResearchJob(92);

    try {
      await engine.poll();
      await fixture.completeRun(seed.runId, uuid(990_001));

      // When
      const cancellation = await engine.cancel(seed.runId);

      // Then
      expect(cancellation).toEqual({ kind: "terminal_immutable" });
      expect((await fixture.run(seed.runId))?.status).toBe("completed");
    } finally {
      await engine.shutdown();
      await fixture.cleanup();
    }
  });
});

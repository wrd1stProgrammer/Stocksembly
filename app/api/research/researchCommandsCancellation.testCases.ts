import { expect, it } from "vitest";
import { RunIdSchema } from "../../../src/research/domain/ids";
import { RunEventsSseRepository } from "../../../src/research/server/api/runEventsSseRepository";
import {
  createLeaseEngine,
  WorkerCrashError,
} from "../../../src/research/worker/leaseEngine";
import {
  commandRequest,
  createRun,
  databaseScalar,
  postCommand,
} from "./researchCommands.testSupport";
import type { ApiHarness } from "./researchRoutes.testSupport";

export function registerResearchCancellationCommandTests(
  harnessValue: () => ApiHarness,
): void {
  it("cancels once, replays idempotently, and keeps a terminal winner immutable", async () => {
    const harness = harnessValue();
    const run = await createRun(harness, "cancel-run");

    const first = await postCommand(
      harness,
      `/api/research/runs/${run.runId}/cancel`,
      "cancel-once",
    );
    const replay = await postCommand(
      harness,
      `/api/research/runs/${run.runId}/cancel`,
      "cancel-once",
    );
    const illegal = await postCommand(
      harness,
      `/api/research/runs/${run.runId}/cancel`,
      "cancel-again",
    );

    expect([
      first.response.status,
      replay.response.status,
      illegal.response.status,
    ]).toEqual([200, 200, 409]);
    expect(replay.body).toEqual(first.body);
    expect(
      databaseScalar(
        harness,
        "SELECT status FROM runs WHERE run_id = ?",
        run.runId,
      ),
    ).toBe("cancelled");
    expect(
      databaseScalar(
        harness,
        `SELECT GROUP_CONCAT(event_type, ',') FROM (
          SELECT event_type FROM run_events WHERE run_id = ? ORDER BY sequence
        )`,
        run.runId,
      ),
    ).toBe("run_created,run_cancelling,run_cancelled");
    expect(
      databaseScalar(
        harness,
        `SELECT json_extract(payload_json, '$.summary.ko') FROM run_events
          WHERE run_id = ? AND event_type = 'run_cancelling'`,
        run.runId,
      ),
    ).toContain("취소");
  });

  it("rejects a cross-origin cancel before any durable mutation", async () => {
    const harness = harnessValue();
    const run = await createRun(harness, "cancel-origin");
    const request = commandRequest(
      harness,
      `/api/research/runs/${run.runId}/cancel`,
      "evil-cancel",
    );
    request.headers.set("origin", "https://evil.example");
    request.headers.set("sec-fetch-site", "cross-site");

    const response = await harness.api.handle(request);

    expect(response.status).toBe(403);
    expect(
      databaseScalar(
        harness,
        "SELECT status FROM runs WHERE run_id = ?",
        run.runId,
      ),
    ).toBe("queued");
  });

  it("signals an active worker and lets cancellation win the publication fence", async () => {
    const harness = harnessValue();
    const run = await createRun(harness, "cancel-active");
    let observedSignal: AbortSignal | undefined;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const engine = createLeaseEngine({
      databasePath: harness.databasePath,
      ownerId: "command-cancellation-worker",
      handler: {
        run: async (_attempt, signal) => {
          observedSignal = signal;
          await gate;
          return { kind: "incomplete", code: "cancelled" };
        },
      },
    });
    const active = engine.poll();

    try {
      const cancelled = await harness.api.handle(
        commandRequest(
          harness,
          `/api/research/runs/${run.runId}/cancel`,
          "cancel-active-now",
        ),
      );
      engine.heartbeat();

      expect(cancelled.status).toBe(202);
      expect(observedSignal?.aborted).toBe(true);
      expect(
        databaseScalar(
          harness,
          `SELECT event_type FROM run_events WHERE run_id = ?
            ORDER BY sequence DESC LIMIT 1`,
          run.runId,
        ),
      ).toBe("run_cancelling");
      release?.();
      await active;
      expect(
        databaseScalar(
          harness,
          "SELECT status FROM runs WHERE run_id = ?",
          run.runId,
        ),
      ).toBe("cancelled");
      expect(
        databaseScalar(
          harness,
          "SELECT report_id FROM runs WHERE run_id = ?",
          run.runId,
        ),
      ).toBeNull();
    } finally {
      release?.();
      await engine.shutdown();
    }
  });

  it("replays worker cancellation through SSE with only safe bilingual public events", async () => {
    const harness = harnessValue();
    const run = await createRun(harness, "worker-cancel-sse");
    const principal = databaseScalar(
      harness,
      "SELECT principal_id FROM research_requests WHERE run_id = ?",
      run.runId,
    );
    if (typeof principal !== "string") throw new TypeError("principal missing");
    const engine = createLeaseEngine({
      databasePath: harness.databasePath,
      ownerId: "worker-cancel-sse",
      handler: { run: async () => ({ kind: "accepted" }) },
    });
    const events = new RunEventsSseRepository({
      databasePath: harness.databasePath,
    });

    try {
      expect(await engine.cancel(RunIdSchema.parse(run.runId))).toEqual({
        kind: "cancelled",
      });
      const snapshot = events.snapshot(principal, run.runId, 0);
      const publicEvents = snapshot?.entries.flatMap((entry) =>
        entry.kind === "public" ? [entry.event] : [],
      );

      expect(snapshot?.lineageComplete).toBe(true);
      expect(snapshot?.entries.every((entry) => entry.kind === "public")).toBe(
        true,
      );
      expect(publicEvents?.map((event) => event.kind)).toEqual([
        "run_created",
        "run_cancelling",
        "run_cancelled",
      ]);
      expect(publicEvents?.slice(-2).every((event) => event.summary)).toBe(
        true,
      );
      expect(JSON.stringify(snapshot)).not.toMatch(
        /attemptId|lease|ownerId|prompt|secret|token|private/i,
      );
    } finally {
      events.close();
      await engine.shutdown();
    }
  });

  it("recovers a worker crash after cancellation without leaving the run stuck", async () => {
    const harness = harnessValue();
    const run = await createRun(harness, "cancel-crashed-worker");
    let workerNow = "2026-07-23T06:00:00.000Z";
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const engine = createLeaseEngine({
      databasePath: harness.databasePath,
      ownerId: "crashed-cancel-worker",
      clock: { now: () => workerNow },
      handler: {
        run: async () => {
          await gate;
          throw new WorkerCrashError("crashed after cancellation request");
        },
      },
    });
    const active = engine.poll();

    try {
      const cancelled = await harness.api.handle(
        commandRequest(
          harness,
          `/api/research/runs/${run.runId}/cancel`,
          "cancel-before-crash",
        ),
      );
      release?.();
      const crashed = await active;
      workerNow = "2026-07-23T06:00:31.000Z";

      expect(cancelled.status).toBe(202);
      expect(crashed.kind).toBe("crashed");
      expect(engine.recoverExpired()).toHaveLength(1);
      expect(
        databaseScalar(
          harness,
          "SELECT status FROM runs WHERE run_id = ?",
          run.runId,
        ),
      ).toBe("cancelled");
      expect(
        databaseScalar(
          harness,
          `SELECT event_type FROM run_events WHERE run_id = ?
            ORDER BY sequence DESC LIMIT 1`,
          run.runId,
        ),
      ).toBe("run_cancelled");
    } finally {
      release?.();
      await engine.shutdown();
    }
  });
}

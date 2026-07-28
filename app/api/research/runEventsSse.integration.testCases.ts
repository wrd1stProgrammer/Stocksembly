import { describe, expect, it } from "vitest";
import { RunIdSchema } from "../../../src/research/domain/ids";
import { createLeaseEngine } from "../../../src/research/worker/leaseEngine";
import {
  commandRequest,
  createRun as createCommandRun,
  databaseScalar,
  postQuestion,
  publishRun,
} from "./researchCommands.testSupport";
import {
  eventId,
  readChunk,
  registerSseHarnessCleanup,
  responseReader,
  streamRequest,
} from "./runEventsSse.testSupport";

const harness = registerSseHarnessCleanup();

describe("durable run event SSE command integration", () => {
  it("keeps grounded Q&A on its separate ledger without poisoning replay", async () => {
    // Given
    const value = await harness();
    const run = await createCommandRun(value, "sse-question-parent");
    const publication = await publishRun(value, run);
    const highWater = databaseScalar(
      value,
      "SELECT last_event_seq FROM runs WHERE run_id = ?",
      run.runId,
    );

    // When
    const question = await postQuestion(
      value,
      publication.reportId,
      "sse-question",
      { question: "What supports the margin view?", locale: "en" },
    );
    const response = await value.api.handle(streamRequest(value, run.runId));
    const reader = responseReader(response);

    // Then
    expect(question.response.status).toBe(202);
    expect(response.status).toBe(200);
    expect(eventId((await readChunk(reader)) ?? "")).toBe(1);
    expect((await reader.read()).done).toBe(true);
    expect(
      databaseScalar(
        value,
        "SELECT last_event_seq FROM runs WHERE run_id = ?",
        run.runId,
      ),
    ).toBe(highWater);
  });

  it("streams only allowlisted cancelling and cancelled command events", async () => {
    // Given
    const value = await harness();
    const run = await createCommandRun(value, "sse-cancel-parent");

    // When
    const cancelled = await value.api.handle(
      commandRequest(
        value,
        `/api/research/runs/${run.runId}/cancel`,
        "sse-cancel",
      ),
    );
    const response = await value.api.handle(
      streamRequest(value, run.runId, "?after=1"),
    );
    const reader = responseReader(response);
    const cancelling = await readChunk(reader);
    const terminal = await readChunk(reader);

    // Then
    expect(cancelled.status).toBe(200);
    expect(cancelling).toContain("event: run_cancelling\n");
    expect(eventId(cancelling ?? "")).toBe(2);
    expect(terminal).toContain("event: run_cancelled\n");
    expect(eventId(terminal ?? "")).toBe(3);
    expect((await reader.read()).done).toBe(true);
  });

  it("streams allowlisted cancellation from the live worker store path", async () => {
    // Given
    const value = await harness();
    const run = await createCommandRun(value, "sse-worker-cancel-parent");
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const engine = createLeaseEngine({
      databasePath: value.databasePath,
      ownerId: "sse-worker-cancel",
      handler: {
        run: async (_attempt, signal) => {
          markStarted?.();
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
          return { kind: "incomplete", code: "cancelled" };
        },
      },
    });
    const active = engine.poll();
    await started;

    try {
      // When
      const cancellation = await engine.cancel(RunIdSchema.parse(run.runId));
      await active;
      const response = await value.api.handle(
        streamRequest(value, run.runId, "?after=1"),
      );
      const reader = responseReader(response);
      const startedCursor = await readChunk(reader);
      const spawnCursor = await readChunk(reader);
      const cancelling = await readChunk(reader);
      const terminal = await readChunk(reader);
      const eventKinds = databaseScalar(
        value,
        `SELECT group_concat(event_type, ',') FROM run_events
        WHERE run_id = ? ORDER BY sequence`,
        run.runId,
      );

      // Then
      expect(cancellation.kind).toBe("cancelled");
      expect(eventKinds).toBe(
        "run_created,run_started,spawn_reserved,run_cancelling,run_cancelled",
      );
      expect(startedCursor).toBe("id: 2\n\n");
      expect(spawnCursor).toBe("id: 3\n\n");
      expect(cancelling).toContain("event: run_cancelling\n");
      expect(eventId(cancelling ?? "")).toBe(4);
      expect(terminal).toContain("event: run_cancelled\n");
      expect(eventId(terminal ?? "")).toBe(5);
      expect((await reader.read()).done).toBe(true);
    } finally {
      await engine.shutdown();
    }
  });

  it("streams a durable retry-wait state from the live worker store path", async () => {
    // Given
    const value = await harness();
    const run = await createCommandRun(value, "sse-runtime-retry-parent");
    const engine = createLeaseEngine({
      databasePath: value.databasePath,
      ownerId: "sse-runtime-retry",
      handler: {
        run: async () => ({
          kind: "transient",
          code: "codex_rate_limited",
          retryAt: "2099-07-24T00:00:00.000Z",
        }),
      },
    });

    try {
      await engine.poll();

      // When
      const response = await value.api.handle(
        streamRequest(value, run.runId, "?after=1"),
      );
      const reader = responseReader(response);
      const startedCursor = await readChunk(reader);
      const spawnCursor = await readChunk(reader);
      const commitCursor = await readChunk(reader);
      const waiting = await readChunk(reader);
      await reader.cancel();

      // Then
      expect(startedCursor).toBe("id: 2\n\n");
      expect(spawnCursor).toBe("id: 3\n\n");
      expect(commitCursor).toBe("id: 4\n\n");
      expect(waiting).toContain("event: runtime_status\n");
      expect(waiting).toContain('"stateId":"waiting"');
      expect(eventId(waiting ?? "")).toBe(5);
    } finally {
      await engine.shutdown();
    }
  });
});

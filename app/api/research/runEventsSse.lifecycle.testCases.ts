import { describe, expect, it, vi } from "vitest";
import { createResearchApi } from "../../../src/research/server/api/researchApi";
import {
  appendEvent,
  beginPendingEvent,
  createRun,
  eventId,
  readChunk,
  registerSseHarnessCleanup,
  responseReader,
  runStatus,
  streamRequest,
} from "./runEventsSse.testSupport";

const harness = registerSseHarnessCleanup();

describe("durable run event SSE lifecycle", () => {
  it("replays ordered events once and resumes after a web restart", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2 });
    appendEvent(value, runId, { sequence: 3 });
    await value.api.close();
    const restarted = await createResearchApi({
      dataRoot: value.root,
      databasePath: value.databasePath,
      allowedHost: value.allowedHost,
      allowedOrigin: value.allowedOrigin,
      readiness: () => Promise.resolve(true),
      availableDiskBytes: () => Promise.resolve(3 * 1024 * 1024 * 1024),
    });

    // When
    const response = await restarted.handle(
      new Request(
        `${value.allowedOrigin}/api/research/runs/${runId}/events?after=1`,
        {
          headers: {
            host: value.allowedHost,
            cookie: value.cookie,
            "last-event-id": "1",
          },
        },
      ),
    );
    const reader = responseReader(response);

    // Then
    expect(eventId((await readChunk(reader)) ?? "")).toBe(2);
    expect(eventId((await readChunk(reader)) ?? "")).toBe(3);
    await reader.cancel();
    await restarted.close();
  });

  it("reconnects against an unchanged bootstrap URL without duplicates", async () => {
    // Given
    vi.useFakeTimers();
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2 });
    appendEvent(value, runId, { sequence: 3 });
    const response = await value.api.handle(
      streamRequest(value, runId, "?after=1", { "last-event-id": "3" }),
    );
    const reader = responseReader(response);
    const pending = readChunk(reader);

    // When
    appendEvent(value, runId, { sequence: 4 });
    await vi.advanceTimersByTimeAsync(1_000);

    // Then
    expect(eventId((await pending) ?? "")).toBe(4);
    await reader.cancel();
  });

  it("flushes the terminal event then closes without mutating run state", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, {
      sequence: 2,
      kind: "run_failed",
      status: "failed",
    });

    // When
    const response = await value.api.handle(
      streamRequest(value, runId, "?after=1"),
    );
    const reader = responseReader(response);

    // Then
    expect(eventId((await readChunk(reader)) ?? "")).toBe(2);
    expect((await reader.read()).done).toBe(true);
    expect(runStatus(value, runId)).toBe("failed");
  });

  it("observes an event committed after the snapshot without loss", async () => {
    // Given
    vi.useFakeTimers();
    const value = await harness();
    const runId = await createRun(value);
    const response = await value.api.handle(
      streamRequest(value, runId, "?after=1"),
    );
    const reader = responseReader(response);
    const pending = readChunk(reader);

    // When
    appendEvent(value, runId, { sequence: 2 });
    await vi.advanceTimersByTimeAsync(1_000);

    // Then
    expect(eventId((await pending) ?? "")).toBe(2);
    await reader.cancel();
  });

  it("does not emit an event before its SQLite transaction commits", async () => {
    // Given
    vi.useFakeTimers();
    const value = await harness();
    const runId = await createRun(value);
    const response = await value.api.handle(
      streamRequest(value, runId, "?after=1"),
    );
    const reader = responseReader(response);
    const pending = readChunk(reader);
    let settled = false;
    pending.then(() => {
      settled = true;
    });
    const transaction = beginPendingEvent(value, runId, { sequence: 2 });

    try {
      // When
      await vi.advanceTimersByTimeAsync(1_000);

      // Then
      expect(settled).toBe(false);
      transaction.commit();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(eventId((await pending) ?? "")).toBe(2);
    } finally {
      transaction.rollback();
      await reader.cancel();
    }
  });

  it("emits a comment heartbeat after fifteen idle seconds", async () => {
    // Given
    vi.useFakeTimers();
    const value = await harness();
    const runId = await createRun(value);
    const response = await value.api.handle(
      streamRequest(value, runId, "?after=1"),
    );
    const reader = responseReader(response);
    const pending = readChunk(reader);

    // When
    await vi.advanceTimersByTimeAsync(15_000);

    // Then
    expect(await pending).toBe(": heartbeat\n\n");
    await reader.cancel();
  });

  it("releases an aborted stream without cancelling its durable run", async () => {
    // Given
    vi.useFakeTimers();
    const value = await harness();
    const runId = await createRun(value);
    const controller = new AbortController();
    const response = await value.api.handle(
      value.request(`/api/research/runs/${runId}/events?after=1`, {
        signal: controller.signal,
      }),
    );
    const reader = responseReader(response);
    const pending = reader.read();

    // When
    controller.abort();

    // Then
    expect((await pending).done).toBe(true);
    expect(runStatus(value, runId)).toBe("queued");
  });

  it("rejects stale credentials after explicit identity rotation", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    await value.api.rotateIdentity();

    // When
    const response = await value.api.handle(
      new Request(`${value.allowedOrigin}/api/research/runs/${runId}/events`, {
        headers: {
          host: value.allowedHost,
          cookie: value.cookie,
          "sec-fetch-site": "same-origin",
        },
      }),
    );

    // Then
    expect(response.status).toBe(401);
  });
});

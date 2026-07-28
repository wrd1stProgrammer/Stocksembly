import { describe, expect, it, vi } from "vitest";
import {
  appendEvent,
  createRun,
  eventId,
  readChunk,
  registerSseHarnessCleanup,
  responseReader,
  streamRequest,
} from "./runEventsSse.testSupport";

const harness = registerSseHarnessCleanup();

describe("durable run event SSE backpressure", () => {
  it("does not poll ahead while the consumer leaves a frame buffered", async () => {
    // Given
    vi.useFakeTimers();
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2 });
    appendEvent(value, runId, { sequence: 3 });
    const response = await value.api.handle(streamRequest(value, runId));
    appendEvent(value, runId, { sequence: 4 });

    // When
    await vi.advanceTimersByTimeAsync(5_000);
    const reader = responseReader(response);
    const initial = [
      eventId((await readChunk(reader)) ?? ""),
      eventId((await readChunk(reader)) ?? ""),
      eventId((await readChunk(reader)) ?? ""),
    ];
    const pending = readChunk(reader);
    let settled = false;
    pending.then(() => {
      settled = true;
    });

    // Then
    expect(initial).toEqual([1, 2, 3]);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(eventId((await pending) ?? "")).toBe(4);
    await reader.cancel();
  });
});

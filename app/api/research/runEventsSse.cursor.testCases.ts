import { describe, expect, it } from "vitest";
import {
  appendEvent,
  createRun,
  eventId,
  pruneEvents,
  pruneSequence,
  readChunk,
  registerSseHarnessCleanup,
  responseReader,
  streamRequest,
} from "./runEventsSse.testSupport";

const harness = registerSseHarnessCleanup();

describe("durable run event SSE cursor and policy", () => {
  it("keeps unknown nested run resources side-effect free", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);

    // When
    const response = await value.api.handle(
      value.request(`/api/research/runs/${runId}/unknown`),
    );

    // Then
    expect(response.status).toBe(404);
  });

  it("returns the persisted event as a public SSE frame from cursor zero", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);

    // When
    const response = await value.api.handle(streamRequest(value, runId));
    const reader = responseReader(response);
    const first = new TextDecoder().decode((await reader.read()).value);

    // Then
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(first).toContain("id: 1\n");
    expect(first).toContain("event: run_created\n");
    expect(first).toContain("data: {");
    expect(first).not.toContain("privateThought");
    await reader.cancel();
  });

  it("advances across a private ledger row without dispatching its contents", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2, kind: "run_started" });
    appendEvent(value, runId, { sequence: 3 });

    // When
    const response = await value.api.handle(
      streamRequest(value, runId, "?after=1"),
    );
    const reader = responseReader(response);
    const cursorOnly = await readChunk(reader);
    await reader.cancel();
    const resumed = await value.api.handle(
      streamRequest(value, runId, "?after=1", { "last-event-id": "2" }),
    );
    const resumedReader = responseReader(resumed);
    const publicEvent = await readChunk(resumedReader);

    // Then
    expect(cursorOnly).toBe("id: 2\n\n");
    expect(cursorOnly).not.toContain("event:");
    expect(cursorOnly).not.toContain("data:");
    expect(cursorOnly).not.toContain("run_started");
    expect(publicEvent).toContain("event: collection_started\n");
    expect(eventId(publicEvent ?? "")).toBe(3);
    await resumedReader.cancel();
  });

  it("uses Last-Event-ID above the unchanged URL bootstrap floor", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2 });
    appendEvent(value, runId, { sequence: 3 });

    // When
    const response = await value.api.handle(
      streamRequest(value, runId, "?after=1", { "last-event-id": "2" }),
    );
    const reader = responseReader(response);

    // Then
    expect(eventId((await readChunk(reader)) ?? "")).toBe(3);
    await reader.cancel();
  });

  it("uses a header-only cursor without replaying its acknowledged event", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2 });
    appendEvent(value, runId, { sequence: 3 });

    // When
    const response = await value.api.handle(
      streamRequest(value, runId, "", { "last-event-id": "2" }),
    );
    const reader = responseReader(response);

    // Then
    expect(eventId((await readChunk(reader)) ?? "")).toBe(3);
    await reader.cancel();
  });

  it.each([
    ["?after=2", "1"],
    ["?after=-1", undefined],
    ["?after=1.5", undefined],
    ["?after=1&after=2", undefined],
    ["?after=4", undefined],
    ["", "4"],
  ])("rejects an invalid or future cursor %s / %s", async (suffix, header) => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2 });
    appendEvent(value, runId, { sequence: 3 });

    // When
    const response = await value.api.handle(
      streamRequest(
        value,
        runId,
        suffix,
        header === undefined ? undefined : { "last-event-id": header },
      ),
    );

    // Then
    expect(response.status).toBe(400);
  });

  it("returns typed missing, auth, host, and pruned failures", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2 });
    appendEvent(value, runId, { sequence: 3 });
    pruneEvents(value, runId, 2);
    const forbiddenRequest = streamRequest(value, runId);
    forbiddenRequest.headers.set("host", "evil.example");

    // When
    const malformed = await value.api.handle(
      value.request("/api/research/runs/not-a-uuid/events"),
    );
    const missing = await value.api.handle(
      value.request(`/api/research/runs/${crypto.randomUUID()}/events`),
    );
    const noCookie = value.request(
      `/api/research/runs/${runId}/events`,
      {},
      false,
    );

    // Then
    expect(malformed.status).toBe(404);
    expect(missing.status).toBe(404);
    expect((await value.api.handle(noCookie)).status).toBe(401);
    expect((await value.api.handle(forbiddenRequest)).status).toBe(403);
    expect((await value.api.handle(streamRequest(value, runId))).status).toBe(
      410,
    );
  });

  it("allows the cursor immediately before retained lineage", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2 });
    appendEvent(value, runId, { sequence: 3 });
    pruneEvents(value, runId, 2);

    // When
    const response = await value.api.handle(
      streamRequest(value, runId, "?after=2"),
    );
    const reader = responseReader(response);

    // Then
    expect(eventId((await readChunk(reader)) ?? "")).toBe(3);
    await reader.cancel();
  });

  it("rejects a cursor at an internally pruned sequence", async () => {
    // Given
    const value = await harness();
    const runId = await createRun(value);
    appendEvent(value, runId, { sequence: 2 });
    appendEvent(value, runId, { sequence: 3 });
    pruneSequence(value, runId, 2);

    // When
    const response = await value.api.handle(
      streamRequest(value, runId, "?after=2"),
    );

    // Then
    expect(response.status).toBe(410);
  });
});

import { expect, it, vi } from "vitest";
import { workflowTestDatabase } from "../../workflow/postgresDatabase.testSupport";
import { RunEventsSseRepository } from "./runEventsSseRepository";
import { createRunEventsStream } from "./runEventsSseStream";

it("sends idle heartbeats without reads and recovers missed notifications at thirty seconds", async () => {
  const database = await workflowTestDatabase();
  const repository = new RunEventsSseRepository({ database });
  const initial = {
    status: "running" as const,
    lastEventSeq: 0,
    minimumEventSeq: null,
    entries: [],
    lineageComplete: true,
  };
  const snapshot = vi
    .spyOn(repository, "snapshot")
    .mockResolvedValue({ ...initial, status: "completed" });
  const close = vi.fn();
  vi.useFakeTimers();
  const signal = new AbortController().signal;
  const stream = createRunEventsStream({
    repository,
    principalId: "owner",
    runId: "run",
    cursor: 0,
    initial,
    requestSignal: signal,
    serviceSignal: signal,
    pollIntervalMs: 30_000,
    heartbeatIntervalMs: 15_000,
    watch: {
      wait: async (ms) =>
        await new Promise((resolve) => setTimeout(() => resolve(false), ms)),
      close,
    },
  });
  const reader = stream.getReader();
  try {
    const heartbeat = reader.read();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(new TextDecoder().decode((await heartbeat).value)).toBe(
      ": heartbeat\n\n",
    );
    expect(snapshot).not.toHaveBeenCalled();
    const next = reader.read();
    await vi.advanceTimersByTimeAsync(15_000);
    await next;
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect((await reader.read()).done).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
    snapshot.mockRestore();
    repository.close();
  }
});

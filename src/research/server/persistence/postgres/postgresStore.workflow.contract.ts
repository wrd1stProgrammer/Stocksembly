import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import {
  IdempotencyConflictError,
  openPostgresStore,
  type PostgresStore,
  UnsafePersistenceValueError,
} from "./postgresStore";
import {
  appendFromSecondProcess,
  at,
  createRunFixture,
  fixture,
  hash,
  temporaryDatabase,
} from "./postgresStore.contractFixtures";

const stores: PostgresStore[] = [];
const cleanups: (() => Promise<void>)[] = [];
async function openTemporary() {
  const temporary = await temporaryDatabase();
  cleanups.push(temporary.close);
  const store = await openPostgresStore(temporary.path);
  stores.push(store);
  return { path: temporary.path, store };
}
async function trackOpen(path: Pool) {
  const store = await openPostgresStore(path);
  stores.push(store);
  return store;
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const close of cleanups.splice(0)) await close();
});
describe("PostgreSQL workflow transactions", () => {
  it("commits state, next job, event sequence atomically", async () => {
    // Given
    const { store } = await openTemporary();
    const ids = fixture(10);
    await store.createRun(createRunFixture(10));
    // When
    const sequence = await store.transitionRun({
      runId: ids.runId,
      fromStatus: "queued",
      toStatus: "running",
      nextJobs: [
        {
          jobId: ids.nextJobId,
          kind: "research",
          logicalKey: "memo:one",
          inputHash: hash(11),
          createdAt: at(1),
        },
      ],
      event: {
        eventId: ids.eventId,
        type: "run_started",
        stateId: "running",
        occurredAt: at(1),
      },
    });
    // Then
    expect(sequence).toBe(2);
    expect(await store.findRun(ids.runId)).toMatchObject({
      status: "running",
      lastEventSeq: 2,
    });
    expect(await store.findJob(ids.nextJobId)).toMatchObject({
      status: "queued",
    });
    expect(
      (await store.eventsAfter(ids.runId, 0)).map((event) => event.sequence),
    ).toEqual([1, 2]);
  });
  it("rolls a nested transition back on a simulated crash and recovers on reopen", async () => {
    // Given
    const { path, store } = await openTemporary();
    const ids = fixture(11);
    await store.createRun(createRunFixture(11));
    // When
    await expect(
      (async () =>
        await store.transaction(async (tx) => {
          await tx.transitionRun({
            runId: ids.runId,
            fromStatus: "queued",
            toStatus: "running",
            nextJobs: [],
            event: {
              eventId: ids.eventId,
              type: "run_started",
              stateId: "running",
              occurredAt: at(1),
            },
          });
          throw new RangeError("simulated process crash before commit");
        }))(),
    ).rejects.toThrow(RangeError);
    await store.close();
    const reopened = await trackOpen(path);
    // Then
    expect(await reopened.findRun(ids.runId)).toMatchObject({
      status: "queued",
      lastEventSeq: 1,
    });
    expect(await reopened.eventsAfter(ids.runId, 0)).toHaveLength(1);
  });
  it("allocates monotonic event sequences across concurrent independent connections", async () => {
    // Given
    const { path, store } = await openTemporary();
    const ids = fixture(12);
    await store.createRun(createRunFixture(12));
    // When
    const sequences = await Promise.all([
      appendFromSecondProcess(path, ids.runId, ids.eventId),
      appendFromSecondProcess(path, ids.runId, ids.nextEventId),
    ]);
    // Then
    expect([...sequences].sort((left, right) => left - right)).toEqual([2, 3]);
    expect(
      (await store.eventsAfter(ids.runId, 0)).map((event) => event.sequence),
    ).toEqual([1, 2, 3]);
    expect((await store.findRun(ids.runId))?.lastEventSeq).toBe(3);
  });
  it("replays identical idempotency requests and rejects conflicts or secrets", async () => {
    // Given
    const { store } = await openTemporary();
    const request = {
      scope: "create-run",
      key: "command-1",
      requestHash: hash(13),
      result: { runId: "durable-run" },
      createdAt: at(1),
    } as const;
    // When
    const created = await store.claimIdempotency(request);
    const replayed = await store.claimIdempotency({
      ...request,
      result: { runId: "ignored" },
    });
    // Then
    expect(created).toEqual({
      kind: "created",
      result: { runId: "durable-run" },
    });
    expect(replayed).toEqual({
      kind: "replayed",
      result: { runId: "durable-run" },
    });
    await expect(
      (async () =>
        await store.claimIdempotency({ ...request, requestHash: hash(14) }))(),
    ).rejects.toThrow(IdempotencyConflictError);
    await expect(
      (async () =>
        await store.claimIdempotency({
          ...request,
          key: "private-command",
          result: { session_secret: "must-not-persist" },
        }))(),
    ).rejects.toThrow(UnsafePersistenceValueError);
  });
});

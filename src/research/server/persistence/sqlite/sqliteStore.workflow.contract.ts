import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  IdempotencyConflictError,
  openSqliteStore,
  type SqliteStore,
  UnsafePersistenceValueError,
} from "./sqliteStore";
import {
  appendFromSecondProcess,
  at,
  createRunFixture,
  fixture,
  hash,
  temporaryDatabase,
} from "./sqliteStore.contractFixtures";

const stores: SqliteStore[] = [];
const directories: string[] = [];

function openTemporary(): {
  readonly path: string;
  readonly store: SqliteStore;
} {
  const temporary = temporaryDatabase();
  directories.push(temporary.directory);
  const store = openSqliteStore(temporary.path);
  stores.push(store);
  return { path: temporary.path, store };
}

function trackOpen(path: string): SqliteStore {
  const store = openSqliteStore(path);
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("SQLite workflow transactions", () => {
  it("commits state, next job, event sequence atomically", () => {
    // Given
    const { store } = openTemporary();
    const ids = fixture(10);
    store.createRun(createRunFixture(10));

    // When
    const sequence = store.transitionRun({
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
    expect(store.findRun(ids.runId)).toMatchObject({
      status: "running",
      lastEventSeq: 2,
    });
    expect(store.findJob(ids.nextJobId)).toMatchObject({ status: "queued" });
    expect(
      store.eventsAfter(ids.runId, 0).map((event) => event.sequence),
    ).toEqual([1, 2]);
  });

  it("rolls a nested transition back on a simulated crash and recovers on reopen", () => {
    // Given
    const { path, store } = openTemporary();
    const ids = fixture(11);
    store.createRun(createRunFixture(11));

    // When
    expect(() =>
      store.transaction(() => {
        store.transitionRun({
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
      }),
    ).toThrow(RangeError);
    store.close();
    const reopened = trackOpen(path);

    // Then
    expect(reopened.findRun(ids.runId)).toMatchObject({
      status: "queued",
      lastEventSeq: 1,
    });
    expect(reopened.eventsAfter(ids.runId, 0)).toHaveLength(1);
  });

  it("allocates monotonic event sequences across concurrent second processes", async () => {
    // Given
    const { path, store } = openTemporary();
    const ids = fixture(12);
    store.createRun(createRunFixture(12));

    // When
    const sequences = await Promise.all([
      appendFromSecondProcess(path, ids.runId, ids.eventId),
      appendFromSecondProcess(path, ids.runId, ids.nextEventId),
    ]);

    // Then
    expect([...sequences].sort((left, right) => left - right)).toEqual([2, 3]);
    expect(
      store.eventsAfter(ids.runId, 0).map((event) => event.sequence),
    ).toEqual([1, 2, 3]);
    expect(store.findRun(ids.runId)?.lastEventSeq).toBe(3);
  });

  it("replays identical idempotency requests and rejects conflicts or secrets", () => {
    // Given
    const { store } = openTemporary();
    const request = {
      scope: "create-run",
      key: "command-1",
      requestHash: hash(13),
      result: { runId: "durable-run" },
      createdAt: at(1),
    } as const;

    // When
    const created = store.claimIdempotency(request);
    const replayed = store.claimIdempotency({
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
    expect(() =>
      store.claimIdempotency({ ...request, requestHash: hash(14) }),
    ).toThrow(IdempotencyConflictError);
    expect(() =>
      store.claimIdempotency({
        ...request,
        key: "private-command",
        result: { session_secret: "must-not-persist" },
      }),
    ).toThrow(UnsafePersistenceValueError);
  });
});

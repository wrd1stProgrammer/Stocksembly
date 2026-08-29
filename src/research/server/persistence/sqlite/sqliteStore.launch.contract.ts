import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteStore, type SqliteStore } from "./sqliteStore";
import {
  at,
  createRunFixture,
  fixture,
  hash,
  temporaryDatabase,
} from "./sqliteStore.contractFixtures";

const stores: SqliteStore[] = [];
const directories: string[] = [];

function database(): { readonly path: string; readonly store: SqliteStore } {
  const temporary = temporaryDatabase();
  directories.push(temporary.directory);
  const store = openSqliteStore(temporary.path);
  stores.push(store);
  return { path: temporary.path, store };
}

function reopen(path: string): SqliteStore {
  const store = openSqliteStore(path);
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("SQLite launch reservations", () => {
  it("burns a research ordinal before launch and preserves it through reopen recovery", () => {
    // Given
    const { path, store } = database();
    const ids = fixture(20);
    const jobInputHash = hash(20);
    store.createRun(createRunFixture(20));
    const firstLease = store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-a",
      now: at(0),
      expiresAt: at(9),
    });
    expect(firstLease).toBeDefined();
    if (firstLease === undefined) throw new RangeError("missing first lease");

    // When
    const first = store.reserveResearchLaunch({
      runId: ids.runId,
      jobId: ids.jobId,
      attemptId: ids.attemptId,
      logicalArtifactKey: "memo:valuation",
      inputHash: jobInputHash,
      ownerId: firstLease.ownerId,
      token: firstLease.token,
      now: at(1),
      reservedAt: at(1),
      event: {
        eventId: ids.eventId,
        type: "spawn_reserved",
        stateId: "spawn-reserved",
        occurredAt: at(1),
      },
    });
    store.close();
    const recovered = reopen(path);

    // Then
    expect(first).toEqual({
      attemptId: ids.attemptId,
      ordinal: 1,
      state: "burned",
    });
    expect(recovered.researchOrdinals(ids.runId)).toEqual([1]);
    expect(recovered.findAttempt(ids.attemptId)).toMatchObject({
      status: "spawn-reserved",
      ordinal: 1,
    });
    expect(recovered.findJob(ids.jobId)).toMatchObject({
      status: "spawn-reserved",
      attemptId: ids.attemptId,
    });
    expect(recovered.eventsAfter(ids.runId, 1)).toEqual([
      expect.objectContaining({ sequence: 2, type: "spawn_reserved" }),
    ]);
    expect(recovered.recoverUncertainAttempts()).toEqual([ids.attemptId]);
    expect(recovered.findAttempt(ids.attemptId)).toMatchObject({
      status: "unknown",
      outcome: "unknown",
      ordinal: 1,
    });

    const secondLease = recovered.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-b",
      now: at(2),
      expiresAt: at(9),
    });
    expect(secondLease).toBeDefined();
    if (secondLease === undefined)
      throw new RangeError("missing recovery lease");
    const second = recovered.reserveResearchLaunch({
      runId: ids.runId,
      jobId: ids.jobId,
      attemptId: ids.nextAttemptId,
      replacementOfAttemptId: ids.attemptId,
      logicalArtifactKey: "memo:valuation",
      inputHash: jobInputHash,
      ownerId: secondLease.ownerId,
      token: secondLease.token,
      now: at(3),
      reservedAt: at(3),
      event: {
        eventId: ids.nextEventId,
        type: "spawn_reserved",
        stateId: "spawn-reserved",
        occurredAt: at(3),
      },
    });
    expect(second.ordinal).toBe(2);
    expect(recovered.researchOrdinals(ids.runId)).toEqual([1, 2]);
    recovered.recoverUncertainAttempts();
    const thirdLease = recovered.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-c",
      now: at(4),
      expiresAt: at(9),
    });
    expect(thirdLease).toBeDefined();
    if (thirdLease === undefined)
      throw new RangeError("missing replacement lease");
    const third = recovered.reserveResearchLaunch({
      runId: ids.runId,
      jobId: ids.jobId,
      attemptId: ids.thirdAttemptId,
      replacementOfAttemptId: ids.nextAttemptId,
      logicalArtifactKey: "memo:valuation",
      inputHash: jobInputHash,
      ownerId: thirdLease.ownerId,
      token: thirdLease.token,
      now: at(5),
      reservedAt: at(5),
      event: {
        eventId: ids.thirdEventId,
        type: "spawn_reserved",
        stateId: "spawn-reserved",
        occurredAt: at(5),
      },
    });
    expect(third.ordinal).toBe(3);
    expect(recovered.researchOrdinals(ids.runId)).toEqual([1, 2, 3]);
  });

  it("allows one job lease winner and fences the stale token after reclaim", () => {
    // Given
    const { path, store } = database();
    const contender = reopen(path);
    const ids = fixture(21);
    store.createRun(createRunFixture(21));

    // When
    const winner = store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-a",
      now: at(0),
      expiresAt: at(5),
    });
    const loser = contender.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-b",
      now: at(1),
      expiresAt: at(6),
    });

    // Then
    expect(winner?.token).toBe(1);
    expect(loser).toBeUndefined();
    const reclaimed = contender.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-b",
      now: at(6),
      expiresAt: at(9),
    });
    expect(reclaimed?.token).toBe(2);
    expect(
      store.heartbeatJobLease({
        jobId: ids.jobId,
        ownerId: "worker-a",
        token: 1,
        now: at(6),
        expiresAt: at(9),
      }),
    ).toBe(false);
  });

  it("uses monotonic maintenance fencing for acquire, quiesce, complete, and release", () => {
    // Given
    const { path, store } = database();
    const contender = reopen(path);
    const first = store.acquireMaintenanceLease({
      name: "backup",
      ownerId: "owner-a",
      now: at(0),
      expiresAt: at(5),
    });
    expect(first).toBeDefined();

    // When
    const blocked = contender.acquireMaintenanceLease({
      name: "backup",
      ownerId: "owner-b",
      now: at(1),
      expiresAt: at(6),
    });
    const reclaimed = contender.acquireMaintenanceLease({
      name: "backup",
      ownerId: "owner-b",
      now: at(6),
      expiresAt: at(9),
    });

    // Then
    expect(blocked).toBeUndefined();
    expect(reclaimed?.token).toBe(2);
    expect(
      store.quiesceMaintenanceLease({
        name: "backup",
        ownerId: "owner-a",
        token: 1,
        now: at(6),
      }),
    ).toBe(false);
    expect(
      contender.quiesceMaintenanceLease({
        name: "backup",
        ownerId: "owner-b",
        token: 2,
        now: at(6),
      }),
    ).toBe(true);
    expect(
      contender.completeMaintenanceLease({
        name: "backup",
        ownerId: "owner-b",
        token: 2,
        now: at(7),
        completedAt: at(7),
      }),
    ).toBe(true);
    expect(
      store.releaseMaintenanceLease({
        name: "backup",
        ownerId: "owner-a",
        token: 1,
        now: at(7),
      }),
    ).toBe(false);
  });
});

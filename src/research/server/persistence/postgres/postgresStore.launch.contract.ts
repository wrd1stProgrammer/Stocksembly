import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { openPostgresStore, type PostgresStore } from "./postgresStore";
import {
  at,
  createRunFixture,
  fixture,
  hash,
  temporaryDatabase,
} from "./postgresStore.contractFixtures";

const stores: PostgresStore[] = [];
const cleanups: (() => Promise<void>)[] = [];
async function database() {
  const temporary = await temporaryDatabase();
  cleanups.push(temporary.close);
  const store = await openPostgresStore(temporary.path);
  stores.push(store);
  return { path: temporary.path, store };
}
async function reopen(path: Pool) {
  const store = await openPostgresStore(path);
  stores.push(store);
  return store;
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const close of cleanups.splice(0)) await close();
});
describe("PostgreSQL launch reservations", () => {
  it("burns a research ordinal before launch and preserves it through reopen recovery", async () => {
    // Given
    const { path, store } = await database();
    const ids = fixture(20);
    const jobInputHash = hash(20);
    await store.createRun(createRunFixture(20));
    const firstLease = await store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-a",
      now: at(0),
      expiresAt: at(9),
    });
    expect(firstLease).toBeDefined();
    if (firstLease === undefined) throw new RangeError("missing first lease");
    // When
    const first = await store.reserveResearchLaunch({
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
    await store.close();
    const recovered = await reopen(path);
    // Then
    expect(first).toEqual({
      attemptId: ids.attemptId,
      ordinal: 1,
      state: "burned",
    });
    expect(await recovered.researchOrdinals(ids.runId)).toEqual([1]);
    expect(await recovered.findAttempt(ids.attemptId)).toMatchObject({
      status: "spawn-reserved",
      ordinal: 1,
    });
    expect(await recovered.findJob(ids.jobId)).toMatchObject({
      status: "spawn-reserved",
      attemptId: ids.attemptId,
    });
    expect(await recovered.eventsAfter(ids.runId, 1)).toEqual([
      expect.objectContaining({ sequence: 2, type: "spawn_reserved" }),
    ]);
    expect(await recovered.recoverUncertainAttempts()).toEqual([ids.attemptId]);
    expect(await recovered.findAttempt(ids.attemptId)).toMatchObject({
      status: "unknown",
      outcome: "unknown",
      ordinal: 1,
    });
    const secondLease = await recovered.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-b",
      now: at(2),
      expiresAt: at(9),
    });
    expect(secondLease).toBeDefined();
    if (secondLease === undefined)
      throw new RangeError("missing recovery lease");
    const second = await recovered.reserveResearchLaunch({
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
    expect(await recovered.researchOrdinals(ids.runId)).toEqual([1, 2]);
    await recovered.recoverUncertainAttempts();
    const thirdLease = await recovered.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-c",
      now: at(4),
      expiresAt: at(9),
    });
    expect(thirdLease).toBeDefined();
    if (thirdLease === undefined)
      throw new RangeError("missing replacement lease");
    const third = await recovered.reserveResearchLaunch({
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
    expect(await recovered.researchOrdinals(ids.runId)).toEqual([1, 2, 3]);
  });
  it("allows one job lease winner and fences the stale token after reclaim", async () => {
    // Given
    const { path, store } = await database();
    const contender = await reopen(path);
    const ids = fixture(21);
    await store.createRun(createRunFixture(21));
    // When
    const winner = await store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-a",
      now: at(0),
      expiresAt: at(5),
    });
    const loser = await contender.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-b",
      now: at(1),
      expiresAt: at(6),
    });
    // Then
    expect(winner?.token).toBe(1);
    expect(loser).toBeUndefined();
    const reclaimed = await contender.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-b",
      now: at(6),
      expiresAt: at(9),
    });
    expect(reclaimed?.token).toBe(2);
    expect(
      await store.heartbeatJobLease({
        jobId: ids.jobId,
        ownerId: "worker-a",
        token: 1,
        now: at(6),
        expiresAt: at(9),
      }),
    ).toBe(false);
  });
  it("uses monotonic maintenance fencing for acquire, quiesce, complete, and release", async () => {
    // Given
    const { path, store } = await database();
    const contender = await reopen(path);
    const first = await store.acquireMaintenanceLease({
      name: "backup",
      ownerId: "owner-a",
      now: at(0),
      expiresAt: at(5),
    });
    expect(first).toBeDefined();
    // When
    const blocked = await contender.acquireMaintenanceLease({
      name: "backup",
      ownerId: "owner-b",
      now: at(1),
      expiresAt: at(6),
    });
    const reclaimed = await contender.acquireMaintenanceLease({
      name: "backup",
      ownerId: "owner-b",
      now: at(6),
      expiresAt: at(9),
    });
    // Then
    expect(blocked).toBeUndefined();
    expect(reclaimed?.token).toBe(2);
    expect(
      await store.quiesceMaintenanceLease({
        name: "backup",
        ownerId: "owner-a",
        token: 1,
        now: at(6),
      }),
    ).toBe(false);
    expect(
      await contender.quiesceMaintenanceLease({
        name: "backup",
        ownerId: "owner-b",
        token: 2,
        now: at(6),
      }),
    ).toBe(true);
    expect(
      await contender.completeMaintenanceLease({
        name: "backup",
        ownerId: "owner-b",
        token: 2,
        now: at(7),
        completedAt: at(7),
      }),
    ).toBe(true);
    expect(
      await store.releaseMaintenanceLease({
        name: "backup",
        ownerId: "owner-a",
        token: 1,
        now: at(7),
      }),
    ).toBe(false);
  });
});

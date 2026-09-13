import { afterEach, describe, expect, it } from "vitest";
import {
  LaunchReservationError,
  openPostgresStore,
  type PostgresStore,
} from "./postgresStore";
import {
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
  return store;
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const close of cleanups.splice(0)) await close();
});
describe("PostgreSQL launch input binding", () => {
  it("rejects an attempt hash that differs from its durable job input", async () => {
    // Given
    const store = await openTemporary();
    const ids = fixture(50);
    await store.createRun(createRunFixture(50));
    const lease = await store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-a",
      now: at(0),
      expiresAt: at(9),
    });
    expect(lease).toBeDefined();
    if (lease === undefined)
      throw new RangeError("missing input-binding lease");
    // When
    const reserveMismatchedInput = async () =>
      await store.reserveResearchLaunch({
        runId: ids.runId,
        jobId: ids.jobId,
        attemptId: ids.attemptId,
        logicalArtifactKey: "memo:bound-input",
        inputHash: hash(3),
        ownerId: lease.ownerId,
        token: lease.token,
        now: at(1),
        reservedAt: at(1),
        event: {
          eventId: ids.eventId,
          type: "spawn_reserved",
          stateId: "spawn-reserved",
          occurredAt: at(1),
        },
      });
    // Then
    await expect(reserveMismatchedInput()).rejects.toThrow(
      LaunchReservationError,
    );
    expect(await store.researchOrdinals(ids.runId)).toEqual([]);
  });
  it("allows a replacement attempt over the same immutable job input", async () => {
    // Given
    const store = await openTemporary();
    const ids = fixture(51);
    const jobInputHash = hash(51);
    await store.createRun(createRunFixture(51));
    const firstLease = await store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-a",
      now: at(0),
      expiresAt: at(9),
    });
    expect(firstLease).toBeDefined();
    if (firstLease === undefined)
      throw new RangeError("missing first immutable-input lease");
    await store.reserveResearchLaunch({
      runId: ids.runId,
      jobId: ids.jobId,
      attemptId: ids.attemptId,
      logicalArtifactKey: "memo:immutable-input",
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
    await store.recoverUncertainAttempts();
    const replacementLease = await store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-b",
      now: at(2),
      expiresAt: at(9),
    });
    expect(replacementLease).toBeDefined();
    if (replacementLease === undefined)
      throw new RangeError("missing replacement immutable-input lease");
    // When
    const replacement = await store.reserveResearchLaunch({
      runId: ids.runId,
      jobId: ids.jobId,
      attemptId: ids.nextAttemptId,
      replacementOfAttemptId: ids.attemptId,
      logicalArtifactKey: "memo:immutable-input",
      inputHash: jobInputHash,
      ownerId: replacementLease.ownerId,
      token: replacementLease.token,
      now: at(3),
      reservedAt: at(3),
      event: {
        eventId: ids.nextEventId,
        type: "spawn_reserved",
        stateId: "spawn-reserved",
        occurredAt: at(3),
      },
    });
    // Then
    expect(replacement).toEqual({
      attemptId: ids.nextAttemptId,
      ordinal: 2,
      state: "burned",
    });
    expect(await store.researchOrdinals(ids.runId)).toEqual([1, 2]);
  });
});

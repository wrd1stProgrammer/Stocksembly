import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  LaunchReservationError,
  openSqliteStore,
  type SqliteStore,
} from "./sqliteStore";
import {
  at,
  createRunFixture,
  fixture,
  hash,
  temporaryDatabase,
} from "./sqliteStore.contractFixtures";

const stores: SqliteStore[] = [];
const directories: string[] = [];

function openTemporary(): SqliteStore {
  const temporary = temporaryDatabase();
  directories.push(temporary.directory);
  const store = openSqliteStore(temporary.path);
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("SQLite launch input binding", () => {
  it("rejects an attempt hash that differs from its durable job input", () => {
    // Given
    const store = openTemporary();
    const ids = fixture(50);
    store.createRun(createRunFixture(50));
    const lease = store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-a",
      now: at(0),
      expiresAt: at(9),
    });
    expect(lease).toBeDefined();
    if (lease === undefined)
      throw new RangeError("missing input-binding lease");

    // When
    const reserveMismatchedInput = () =>
      store.reserveResearchLaunch({
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
    expect(reserveMismatchedInput).toThrow(LaunchReservationError);
    expect(store.researchOrdinals(ids.runId)).toEqual([]);
  });

  it("allows a replacement attempt over the same immutable job input", () => {
    // Given
    const store = openTemporary();
    const ids = fixture(51);
    const jobInputHash = hash(51);
    store.createRun(createRunFixture(51));
    const firstLease = store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-a",
      now: at(0),
      expiresAt: at(9),
    });
    expect(firstLease).toBeDefined();
    if (firstLease === undefined)
      throw new RangeError("missing first immutable-input lease");
    store.reserveResearchLaunch({
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
    store.recoverUncertainAttempts();
    const replacementLease = store.leaseJob({
      jobId: ids.jobId,
      ownerId: "worker-b",
      now: at(2),
      expiresAt: at(9),
    });
    expect(replacementLease).toBeDefined();
    if (replacementLease === undefined)
      throw new RangeError("missing replacement immutable-input lease");

    // When
    const replacement = store.reserveResearchLaunch({
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
    expect(store.researchOrdinals(ids.runId)).toEqual([1, 2]);
  });
});

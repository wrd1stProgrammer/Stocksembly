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

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("SQLite research replacement limits", () => {
  it("rejects a sixth replacement across distinct logical artifacts", () => {
    // Given
    const temporary = temporaryDatabase();
    directories.push(temporary.directory);
    const store = openSqliteStore(temporary.path);
    stores.push(store);
    const run = fixture(40);
    const lanes = [
      { ids: fixture(40), logical: "artifact:a", inputHash: hash(1) },
      { ids: fixture(41), logical: "artifact:b", inputHash: hash(2) },
      { ids: fixture(42), logical: "artifact:c", inputHash: hash(3) },
      { ids: fixture(43), logical: "artifact:d", inputHash: hash(4) },
      { ids: fixture(44), logical: "artifact:e", inputHash: hash(5) },
      { ids: fixture(45), logical: "artifact:f", inputHash: hash(6) },
      { ids: fixture(46), logical: "artifact:a", inputHash: hash(7) },
      { ids: fixture(47), logical: "artifact:b", inputHash: hash(8) },
      { ids: fixture(48), logical: "artifact:c", inputHash: hash(9) },
      { ids: fixture(49), logical: "artifact:d", inputHash: hash(10) },
      { ids: fixture(50), logical: "artifact:e", inputHash: hash(11) },
      { ids: fixture(51), logical: "artifact:f", inputHash: hash(12) },
    ] as const;
    const first = lanes[0];
    store.createRun({
      ...createRunFixture(40),
      initialJob: {
        jobId: first.ids.jobId,
        kind: "research",
        logicalKey: "base-job:a",
        inputHash: first.inputHash,
        createdAt: at(0),
      },
    });
    store.transitionRun({
      runId: run.runId,
      fromStatus: "queued",
      toStatus: "running",
      nextJobs: lanes.slice(1).map((lane, index) => ({
        jobId: lane.ids.jobId,
        kind: "research",
        logicalKey: `job:${index + 1}:${lane.logical}`,
        inputHash: lane.inputHash,
        createdAt: at(1),
      })),
      event: {
        eventId: run.eventId,
        type: "run_started",
        stateId: "running",
        occurredAt: at(1),
      },
    });
    for (const lane of lanes.slice(0, 6)) {
      const lease = store.leaseJob({
        jobId: lane.ids.jobId,
        ownerId: `base:${lane.logical}`,
        now: at(2),
        expiresAt: at(30),
      });
      expect(lease).toBeDefined();
      if (lease === undefined) throw new RangeError("missing base lease");
      store.reserveResearchLaunch({
        runId: run.runId,
        jobId: lane.ids.jobId,
        attemptId: lane.ids.attemptId,
        logicalArtifactKey: lane.logical,
        inputHash: lane.inputHash,
        ownerId: lease.ownerId,
        token: lease.token,
        now: at(3),
        reservedAt: at(3),
        event: {
          eventId: lane.ids.nextEventId,
          type: "spawn_reserved",
          stateId: "spawn-reserved",
          occurredAt: at(3),
        },
      });
    }
    const replacementPairs = [
      { base: lanes[0], replacement: lanes[6] },
      { base: lanes[1], replacement: lanes[7] },
      { base: lanes[2], replacement: lanes[8] },
      { base: lanes[3], replacement: lanes[9] },
      { base: lanes[4], replacement: lanes[10] },
    ] as const;
    for (const pair of replacementPairs) {
      const lease = store.leaseJob({
        jobId: pair.replacement.ids.jobId,
        ownerId: `replacement:${pair.base.logical}`,
        now: at(4),
        expiresAt: at(30),
      });
      expect(lease).toBeDefined();
      if (lease === undefined)
        throw new RangeError("missing replacement lease");
      store.reserveResearchLaunch({
        runId: run.runId,
        jobId: pair.replacement.ids.jobId,
        attemptId: pair.replacement.ids.attemptId,
        replacementOfAttemptId: pair.base.ids.attemptId,
        logicalArtifactKey: pair.base.logical,
        inputHash: pair.replacement.inputHash,
        ownerId: lease.ownerId,
        token: lease.token,
        now: at(5),
        reservedAt: at(5),
        event: {
          eventId: pair.replacement.ids.thirdEventId,
          type: "spawn_reserved",
          stateId: "spawn-reserved",
          occurredAt: at(5),
        },
      });
    }
    const sixth = { base: lanes[5], replacement: lanes[11] };
    const sixthLease = store.leaseJob({
      jobId: sixth.replacement.ids.jobId,
      ownerId: "replacement:artifact:f",
      now: at(6),
      expiresAt: at(30),
    });
    expect(sixthLease).toBeDefined();
    if (sixthLease === undefined) throw new RangeError("missing sixth lease");

    // When
    const reserveSixth = () =>
      store.reserveResearchLaunch({
        runId: run.runId,
        jobId: sixth.replacement.ids.jobId,
        attemptId: sixth.replacement.ids.attemptId,
        replacementOfAttemptId: sixth.base.ids.attemptId,
        logicalArtifactKey: sixth.base.logical,
        inputHash: sixth.replacement.inputHash,
        ownerId: sixthLease.ownerId,
        token: sixthLease.token,
        now: at(7),
        reservedAt: at(7),
        event: {
          eventId: sixth.replacement.ids.thirdEventId,
          type: "spawn_reserved",
          stateId: "spawn-reserved",
          occurredAt: at(7),
        },
      });

    // Then
    expect(reserveSixth).toThrow(/replacement budget/i);
    expect(store.researchOrdinals(run.runId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });
});

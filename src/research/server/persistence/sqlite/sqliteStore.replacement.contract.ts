import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteStore, type SqliteStore } from "./sqliteStore";
import {
  at,
  createRunFixture,
  fixture,
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
  it("allows twelve replacements and rejects the thirteenth", () => {
    // Given
    const temporary = temporaryDatabase();
    directories.push(temporary.directory);
    const store = openSqliteStore(temporary.path);
    stores.push(store);
    const run = fixture(40);
    const lanes = Array.from({ length: 26 }, (_, index) => ({
      ids: fixture(40 + index),
      logical: `artifact:${index % 13}`,
      inputHash: (index + 1).toString(16).padStart(64, "0"),
    }));
    const first = lanes[0];
    if (first === undefined) throw new RangeError("missing first lane");
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
    for (const lane of lanes.slice(0, 13)) {
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
    const replacementPairs = lanes.slice(0, 12).map((base, index) => {
      const replacement = lanes[index + 13];
      if (replacement === undefined)
        throw new RangeError("missing replacement lane");
      return { base, replacement };
    });
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
    const finalBase = lanes[12];
    const thirteenth = lanes[25];
    if (finalBase === undefined || thirteenth === undefined)
      throw new RangeError("missing thirteenth replacement lanes");
    const thirteenthLease = store.leaseJob({
      jobId: thirteenth.ids.jobId,
      ownerId: "replacement:artifact:12",
      now: at(6),
      expiresAt: at(30),
    });
    expect(thirteenthLease).toBeDefined();
    if (thirteenthLease === undefined)
      throw new RangeError("missing thirteenth lease");

    // When
    const reserveThirteenth = () =>
      store.reserveResearchLaunch({
        runId: run.runId,
        jobId: thirteenth.ids.jobId,
        attemptId: thirteenth.ids.attemptId,
        replacementOfAttemptId: finalBase.ids.attemptId,
        logicalArtifactKey: finalBase.logical,
        inputHash: thirteenth.inputHash,
        ownerId: thirteenthLease.ownerId,
        token: thirteenthLease.token,
        now: at(7),
        reservedAt: at(7),
        event: {
          eventId: thirteenth.ids.thirdEventId,
          type: "spawn_reserved",
          stateId: "spawn-reserved",
          occurredAt: at(7),
        },
      });

    // Then
    expect(reserveThirteenth).toThrow(/replacement budget/i);
    expect(store.researchOrdinals(run.runId)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
  });
});

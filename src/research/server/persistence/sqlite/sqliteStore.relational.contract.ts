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

describe("SQLite relational repositories", () => {
  it("resolves canonical artifact identity by content hash for same-snapshot retries", () => {
    const store = openTemporary();
    const ids = fixture(29);
    store.createRun(createRunFixture(29));
    store.saveArtifactMetadata({
      artifactId: ids.artifactId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      contentHash: hash(9),
      byteLength: 12,
      mediaType: "application/json",
      logicalKey: "evidence:retry",
      inputHash: hash(8),
      createdAt: at(1),
    });
    const canonicalId = store.saveArtifactMetadata({
      artifactId: ids.parentArtifactId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      contentHash: hash(9),
      byteLength: 12,
      mediaType: "application/json",
      logicalKey: "evidence:retry-duplicate",
      inputHash: hash(8),
      createdAt: at(2),
    });

    expect(store.findArtifactByContentHash(hash(9), ids.snapshotId)).toEqual({
      artifactId: ids.artifactId,
      snapshotId: ids.snapshotId,
    });
    expect(canonicalId).toBe(ids.artifactId);
    expect(
      store.findArtifactByContentHash(hash(7), ids.snapshotId),
    ).toBeUndefined();
  });

  it("enforces foreign keys and rolls unique logical job conflicts back", () => {
    // Given
    const store = openTemporary();
    const ids = fixture(30);
    const unknown = fixture(31);
    store.createRun(createRunFixture(30));

    // When
    const missingRunWrite = () =>
      store.saveArtifactMetadata({
        artifactId: unknown.artifactId,
        runId: unknown.runId,
        snapshotId: ids.snapshotId,
        contentHash: hash(1),
        byteLength: 12,
        mediaType: "application/json",
        logicalKey: "orphan",
        inputHash: hash(2),
        createdAt: at(1),
      });
    const duplicateLogicalJob = () =>
      store.transitionRun({
        runId: ids.runId,
        fromStatus: "queued",
        toStatus: "running",
        nextJobs: [
          {
            jobId: ids.nextJobId,
            kind: "research",
            logicalKey: "research:30",
            inputHash: hash(3),
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
    expect(missingRunWrite).toThrow(/FOREIGN KEY/);
    expect(duplicateLogicalJob).toThrow(/UNIQUE/);
    expect(store.findRun(ids.runId)).toMatchObject({
      status: "queued",
      lastEventSeq: 1,
    });
    expect(store.eventsAfter(ids.runId, 0)).toHaveLength(1);
  });

  it("persists artifact edges, report versions, and one question ordinal per attempt", () => {
    // Given
    const store = openTemporary();
    const ids = fixture(32);
    store.createRun(createRunFixture(32));
    store.transitionRun({
      runId: ids.runId,
      fromStatus: "queued",
      toStatus: "running",
      nextJobs: [
        {
          jobId: ids.nextJobId,
          kind: "qa",
          logicalKey: "question:32",
          inputHash: hash(4),
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
    store.saveArtifactMetadata({
      artifactId: ids.parentArtifactId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      contentHash: hash(5),
      byteLength: 10,
      mediaType: "application/json",
      logicalKey: "evidence",
      inputHash: hash(6),
      createdAt: at(1),
    });
    store.saveArtifactMetadata({
      artifactId: ids.artifactId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      contentHash: hash(7),
      byteLength: 20,
      mediaType: "application/json",
      logicalKey: "report",
      inputHash: hash(8),
      createdAt: at(2),
    });
    store.addArtifactEdge({
      childArtifactId: ids.artifactId,
      parentArtifactId: ids.parentArtifactId,
      relation: "derived-from",
    });
    const version = store.saveReportVersion({
      reportId: ids.reportId,
      versionId: ids.versionId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      artifactId: ids.artifactId,
      status: "complete_with_limitations",
      publishedAt: at(2),
      publicPayload: { title: "Durable report" },
    });
    const questionOrdinal = store.createQuestion({
      questionId: ids.questionId,
      reportId: ids.reportId,
      reportVersionId: ids.versionId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      jobId: ids.nextJobId,
      question: { en: "Why?", ko: "왜?" },
      createdAt: at(3),
    });
    const lease = store.leaseJob({
      jobId: ids.nextJobId,
      ownerId: "qa-worker",
      now: at(3),
      expiresAt: at(9),
    });
    expect(lease).toBeDefined();
    if (lease === undefined) throw new RangeError("missing question lease");

    // When
    const reservation = store.reserveQuestionLaunch({
      questionId: ids.questionId,
      attemptId: ids.attemptId,
      inputHash: hash(4),
      ownerId: lease.ownerId,
      token: lease.token,
      now: at(4),
      reservedAt: at(4),
      event: {
        eventId: ids.nextEventId,
        type: "spawn_reserved",
        stateId: "spawn-reserved",
        occurredAt: at(4),
      },
    });

    // Then
    expect(version).toBe(1);
    expect(questionOrdinal).toBe(1);
    expect(reservation).toEqual({
      attemptId: ids.attemptId,
      ordinal: 1,
      state: "burned",
    });
    expect(store.findAttempt(ids.attemptId)).toMatchObject({ ordinal: 1 });
    expect(() =>
      store.reserveQuestionLaunch({
        questionId: ids.questionId,
        attemptId: ids.nextAttemptId,
        inputHash: hash(4),
        ownerId: lease.ownerId,
        token: lease.token,
        now: at(5),
        reservedAt: at(5),
        event: {
          eventId: ids.thirdEventId,
          type: "spawn_reserved",
          stateId: "spawn-reserved",
          occurredAt: at(5),
        },
      }),
    ).toThrow();
  });
});

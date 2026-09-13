// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { researchTransaction } from "./database";
import { migrateResearchDatabase } from "./migrations";
import { PostgresStore } from "./postgresStore";

const databaseUrl = process.env["STOCKSEMBLY_TEST_DATABASE_URL"];
const suite = test.skipIf(!databaseUrl);
let pool: Pool;
let store: PostgresStore;
const now = "2026-09-13T00:00:00.000Z";
const digest = "a".repeat(64);

beforeAll(async () => {
  if (!databaseUrl) return;
  const url = new URL(databaseUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test")
  )
    throw new Error("LOCAL_TEST_DATABASE_REQUIRED");
  pool = new Pool({ connectionString: databaseUrl, max: 8 });
  await migrateResearchDatabase(pool);
  store = await PostgresStore.open(pool);
});
afterAll(async () => {
  if (pool) await pool.end();
});

async function seed() {
  const runId = RunIdSchema.parse(randomUUID()),
    snapshotId = SnapshotIdSchema.parse(randomUUID()),
    jobId = JobIdSchema.parse(randomUUID());
  await store.createRun({
    runId,
    snapshotId,
    requestedAt: now,
    initialJob: {
      jobId,
      kind: "research",
      logicalKey: "memo:valuation",
      inputHash: digest,
      createdAt: now,
    },
    initialEvent: {
      eventId: EventIdSchema.parse(randomUUID()),
      type: "run_queued",
      stateId: "queued",
      occurredAt: now,
    },
  });
  return { runId, snapshotId, jobId };
}

suite(
  "nested store transactions roll back all repository writes together",
  async () => {
    const runId = RunIdSchema.parse(randomUUID()),
      snapshotId = SnapshotIdSchema.parse(randomUUID());
    await expect(
      store.transaction(async (tx) => {
        await tx.createRun({
          runId,
          snapshotId,
          requestedAt: now,
          initialJob: {
            jobId: JobIdSchema.parse(randomUUID()),
            kind: "research",
            logicalKey: "memo:valuation",
            inputHash: digest,
            createdAt: now,
          },
          initialEvent: {
            eventId: EventIdSchema.parse(randomUUID()),
            type: "run_queued",
            stateId: "queued",
            occurredAt: now,
          },
        });
        await tx.appendRunEvent({
          runId,
          event: {
            eventId: EventIdSchema.parse(randomUUID()),
            type: "state_committed",
            stateId: "running",
            occurredAt: now,
          },
        });
        throw new Error("rollback probe");
      }),
    ).rejects.toThrow("rollback probe");
    expect(await store.findRun(runId)).toBeUndefined();
  },
);

suite(
  "nested savepoint failure leaves the caller transaction usable",
  async () => {
    await researchTransaction(pool, async (client) => {
      await expect(
        researchTransaction(client, async (nested) => {
          await nested.query("SELECT unknown_column");
        }),
      ).rejects.toThrow();
      expect((await client.query("SELECT 1 AS value")).rows).toEqual([
        { value: 1 },
      ]);
    });
  },
);

suite(
  "concurrent idempotency claims create once and return the original result",
  async () => {
    const input = {
      scope: "pg-contract",
      key: randomUUID(),
      requestHash: digest,
      result: { id: randomUUID() },
      createdAt: now,
    };
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => store.claimIdempotency(input)),
    );
    expect(outcomes.filter((result) => result.kind === "created")).toHaveLength(
      1,
    );
    expect(
      outcomes.every(
        (result) =>
          JSON.stringify(result.result) === JSON.stringify(input.result),
      ),
    ).toBe(true);
    await expect(
      store.claimIdempotency({ ...input, requestHash: "b".repeat(64) }),
    ).rejects.toThrow();
  },
);

suite(
  "concurrent artifact deduplication keeps one canonical identity",
  async () => {
    const ids = await seed();
    const values = await Promise.all(
      Array.from({ length: 5 }, () =>
        store.saveArtifactMetadata({
          artifactId: ArtifactIdSchema.parse(randomUUID()),
          ...ids,
          contentHash: digest,
          byteLength: 2,
          mediaType: "application/json",
          logicalKey: "evidence:one",
          inputHash: digest,
          createdAt: now,
        }),
      ),
    );
    expect(new Set(values).size).toBe(1);
    expect(
      (
        await pool.query(
          "SELECT artifact_id FROM research.artifacts WHERE run_id=$1",
          [ids.runId],
        )
      ).rowCount,
    ).toBe(1);
  },
);

suite(
  "parallel launch reservations allocate distinct ordinals on the same run",
  async () => {
    const ids = await seed();
    const nextJobId = JobIdSchema.parse(randomUUID());
    await store.transitionRun({
      runId: ids.runId,
      fromStatus: "queued",
      toStatus: "running",
      nextJobs: [
        {
          jobId: nextJobId,
          kind: "research",
          logicalKey: "memo:industry",
          inputHash: "b".repeat(64),
          createdAt: now,
        },
      ],
      event: {
        eventId: EventIdSchema.parse(randomUUID()),
        type: "run_started",
        stateId: "running",
        occurredAt: now,
      },
    });
    const reservations = await Promise.all(
      [ids.jobId, nextJobId].map(async (jobId, index) => {
        const lease = await store.leaseJob({
          jobId,
          ownerId: "test",
          now,
          expiresAt: "2026-09-13T00:10:00.000Z",
        });
        if (!lease) throw new Error("missing lease");
        return store.reserveResearchLaunch({
          runId: ids.runId,
          jobId,
          attemptId: AttemptIdSchema.parse(randomUUID()),
          logicalArtifactKey: index === 0 ? "memo:valuation" : "memo:industry",
          inputHash: index === 0 ? digest : "b".repeat(64),
          ownerId: "test",
          token: lease.token,
          now,
          reservedAt: now,
          event: {
            eventId: EventIdSchema.parse(randomUUID()),
            type: "spawn_reserved",
            stateId: "spawn-reserved",
            occurredAt: now,
          },
        });
      }),
    );
    expect(reservations.map((row) => row.ordinal).sort()).toEqual([1, 2]);
    expect(await store.researchOrdinals(ids.runId)).toEqual([1, 2]);
    expect(
      (await store.eventsAfter(ids.runId, 0)).map((row) => row.sequence),
    ).toEqual([1, 2, 3, 4]);
  },
);

suite(
  "cancellation with no active attempt atomically reaches terminal state",
  async () => {
    const ids = await seed();
    const result = await store.requestRunCancellation({
      runId: ids.runId,
      eventId: EventIdSchema.parse(randomUUID()),
      terminalEventId: EventIdSchema.parse(randomUUID()),
      now,
    });
    expect(result.kind).toBe("requested");
    expect((await store.findRun(ids.runId))?.status).toBe("cancelled");
    expect((await store.findJob(ids.jobId))?.status).toBe("cancelled");
    expect(
      (await store.eventsAfter(ids.runId, 0)).map((row) => row.sequence),
    ).toEqual([1, 2, 3]);
  },
);

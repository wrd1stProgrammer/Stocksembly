// @vitest-environment node
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../research/domain/ids";
import {
  acquireMaintenanceLease,
  heartbeatJobLease,
  leaseJob,
  quiesceMaintenanceLease,
  releaseMaintenanceLease,
} from "../../research/server/persistence/postgres/leaseRepository";
import { migrateResearchDatabase } from "../../research/server/persistence/postgres/migrations";
import {
  appendRunEvent,
  createRun,
  eventsAfter,
  findRun,
  transitionRun,
} from "../../research/server/persistence/postgres/runRepository";
import { applyResearchMigrations } from "./postgresMigrations";
import { postgresTransaction } from "./postgresTransaction";

const databaseUrl = process.env["STOCKSEMBLY_TEST_DATABASE_URL"];
const suite = test.skipIf(!databaseUrl);
let pool: Pool;

beforeAll(async () => {
  if (!databaseUrl) return;
  const url = new URL(databaseUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test") ||
    url.search !== ""
  ) {
    throw new Error(
      "PostgreSQL integration tests require a local *_test database",
    );
  }
  pool = new Pool({ connectionString: databaseUrl, max: 4 });
  await pool.query("DROP SCHEMA IF EXISTS research CASCADE");
});

afterAll(async () => {
  if (pool) await pool.end();
});

suite(
  "serializes migrations and preserves transaction rollback and integrity",
  async () => {
    const migrations = [
      {
        version: 1,
        name: "001_transaction_probe.sql",
        sql: "CREATE TABLE transaction_probe (id text PRIMARY KEY, value integer NOT NULL)",
      },
    ] as const;
    await Promise.all([
      applyResearchMigrations(pool, migrations),
      applyResearchMigrations(pool, migrations),
    ]);
    expect(
      (await pool.query("SELECT * FROM research.schema_migrations")).rowCount,
    ).toBe(1);
    await postgresTransaction(pool, async (client) => {
      await client.query(
        "INSERT INTO research.transaction_probe VALUES ($1, $2)",
        ["committed", 1],
      );
    });
    await expect(
      postgresTransaction(pool, async (client) => {
        await client.query(
          "INSERT INTO research.transaction_probe VALUES ($1, $2)",
          ["rolled-back", 2],
        );
        throw new Error("cancel transaction");
      }),
    ).rejects.toThrow("cancel transaction");
    expect(
      (await pool.query("SELECT id FROM research.transaction_probe")).rows,
    ).toEqual([{ id: "committed" }]);
    await expect(
      applyResearchMigrations(pool, [{ ...migrations[0], sql: "SELECT 1" }]),
    ).rejects.toThrow("RESEARCH_MIGRATION_INTEGRITY_FAILED");
    await expect(
      applyResearchMigrations(pool, [
        ...migrations,
        {
          version: 2,
          name: "002_broken.sql",
          sql: "CREATE TABLE should_rollback (id text); SELECT missing_column FROM research.transaction_probe",
        },
      ]),
    ).rejects.toThrow();
    expect(
      (
        await pool.query(
          "SELECT to_regclass('research.should_rollback') AS relation",
        )
      ).rows,
    ).toEqual([{ relation: null }]);
  },
);

suite("creates the full research baseline with all foreign keys", async () => {
  await pool.query("DROP SCHEMA research CASCADE");
  await migrateResearchDatabase(pool);
  const tables = await pool.query(
    "SELECT count(*)::integer AS count FROM information_schema.tables WHERE table_schema = 'research' AND table_type = 'BASE TABLE'",
  );
  expect(tables.rows).toEqual([{ count: 37 }]);
  const constraints = await pool.query(
    "SELECT count(*)::integer AS count FROM information_schema.table_constraints WHERE constraint_schema = 'research' AND constraint_type = 'FOREIGN KEY'",
  );
  expect(constraints.rows).toEqual([{ count: 67 }]);
});

suite(
  "serializes event allocation, transition versions, and competing job leases",
  async () => {
    const runId = RunIdSchema.parse(randomUUID());
    const snapshotId = SnapshotIdSchema.parse(randomUUID());
    const jobId = JobIdSchema.parse(randomUUID());
    const now = "2026-09-13T00:00:00.000Z";
    const draft = () => ({
      eventId: EventIdSchema.parse(randomUUID()),
      type: "probe",
      stateId: "queued",
      occurredAt: now,
    });
    await createRun(pool, {
      runId,
      snapshotId,
      requestedAt: now,
      initialJob: {
        jobId,
        kind: "research",
        logicalKey: "collection",
        inputHash: "a".repeat(64),
        createdAt: now,
      },
      initialEvent: draft(),
    });
    const sequences = await Promise.all(
      Array.from({ length: 8 }, () =>
        appendRunEvent(pool, { runId, event: draft() }),
      ),
    );
    expect(sequences.sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(
      (await eventsAfter(pool, runId, 0)).map((event) => event.sequence),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const transition = {
      runId,
      fromStatus: "queued" as const,
      toStatus: "running" as const,
      expectedVersion: 0,
      nextJobs: [],
    };
    const transitions = await Promise.allSettled([
      transitionRun(pool, { ...transition, event: draft() }),
      transitionRun(pool, { ...transition, event: draft() }),
    ]);
    expect(
      transitions.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await findRun(pool, runId))?.version).toBe(1);
    const duplicate = draft();
    await appendRunEvent(pool, { runId, event: duplicate });
    await expect(
      appendRunEvent(pool, { runId, event: duplicate }),
    ).rejects.toThrow();
    expect((await findRun(pool, runId))?.lastEventSeq).toBe(11);
    const leases = await Promise.all(
      ["worker-a", "worker-b"].map((ownerId) =>
        leaseJob(pool, {
          jobId,
          ownerId,
          now,
          expiresAt: "2026-09-13T00:01:00.000Z",
        }),
      ),
    );
    expect(leases.filter(Boolean)).toHaveLength(1);
    const winner = leases.find((lease) => lease !== undefined);
    if (!winner) throw new Error("Expected exactly one lease");
    const replacement = await leaseJob(pool, {
      jobId,
      ownerId: "replacement",
      now: "2026-09-13T00:02:00.000Z",
      expiresAt: "2026-09-13T00:03:00.000Z",
    });
    expect(replacement?.token).toBe(winner.token + 1);
    expect(
      await heartbeatJobLease(pool, {
        jobId,
        ownerId: winner.ownerId,
        token: winner.token,
        now: "2026-09-13T00:02:00.000Z",
        expiresAt: "2026-09-13T00:04:00.000Z",
      }),
    ).toBe(false);
  },
);

suite("fences maintenance ownership across competing processes", async () => {
  const name = "cutover";
  const now = "2026-09-13T00:00:00.000Z";
  const leases = await Promise.all(
    ["first", "second"].map((ownerId) =>
      acquireMaintenanceLease(pool, {
        name,
        ownerId,
        now,
        expiresAt: "2026-09-13T00:01:00.000Z",
      }),
    ),
  );
  expect(leases.filter(Boolean)).toHaveLength(1);
  const original = leases.find((lease) => lease !== undefined);
  if (!original) throw new Error("Expected maintenance ownership");
  expect(
    await quiesceMaintenanceLease(pool, {
      name,
      ownerId: original.ownerId,
      token: original.token,
      now,
    }),
  ).toBe(true);
  const replacement = await acquireMaintenanceLease(pool, {
    name,
    ownerId: "next",
    now: "2026-09-13T00:02:00.000Z",
    expiresAt: "2026-09-13T00:03:00.000Z",
  });
  expect(replacement?.token).toBe(original.token + 1);
  expect(
    await releaseMaintenanceLease(pool, {
      name,
      ownerId: original.ownerId,
      token: original.token,
      now: "2026-09-13T00:02:00.000Z",
    }),
  ).toBe(false);
});

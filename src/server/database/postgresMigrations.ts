import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { postgresTransaction } from "./postgresTransaction";

export type PostgresMigration = {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
};

/** Research has its own schema; account tables remain in public. */
export async function applyResearchMigrations(
  pool: Pool,
  migrations: readonly PostgresMigration[],
): Promise<void> {
  const expected = migrations.map((migration, index) => {
    if (migration.version !== index + 1 || migration.name.trim() === "") {
      throw new Error("RESEARCH_MIGRATION_SEQUENCE_INVALID");
    }
    return {
      ...migration,
      checksum: createHash("sha256").update(migration.sql).digest("hex"),
    };
  });
  await postgresTransaction(pool, async (client) => {
    // Transaction-scoped lock also serializes the first schema creation.
    await client.query("SELECT pg_advisory_xact_lock(1937010547, 1)");
    await client.query("CREATE SCHEMA IF NOT EXISTS research");
    await client.query(`CREATE TABLE IF NOT EXISTS research.schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL UNIQUE,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = await client.query<{
      version: number;
      name: string;
      checksum: string;
    }>(
      "SELECT version, name, checksum FROM research.schema_migrations ORDER BY version",
    );
    for (const [index, row] of applied.rows.entries()) {
      const migration = expected[index];
      if (
        migration === undefined ||
        row.version !== migration.version ||
        row.name !== migration.name ||
        row.checksum !== migration.checksum
      ) {
        throw new Error(`RESEARCH_MIGRATION_INTEGRITY_FAILED:${row.version}`);
      }
    }
    await client.query("SET LOCAL search_path TO research, pg_catalog");
    for (const migration of expected.slice(applied.rows.length)) {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO research.schema_migrations(version, name, checksum) VALUES ($1, $2, $3)",
        [migration.version, migration.name, migration.checksum],
      );
    }
  });
}

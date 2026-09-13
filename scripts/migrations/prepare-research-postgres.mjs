import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { databaseConfiguration } from "./import-research-postgres.mjs";

if (process.argv.includes("--help")) {
  console.log(
    "Usage: node scripts/migrations/prepare-research-postgres.mjs\nApplies checked-in PostgreSQL research migrations. Uses existing database configuration; does not enable production cutover.",
  );
} else {
  const directory = resolve(
    process.env.STOCKSEMBLY_MIGRATIONS_DIR ??
      "src/research/server/persistence/postgres/migrations",
  );
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();
  if (!names.length) throw new Error("MIGRATIONS_UNAVAILABLE");
  const migrations = await Promise.all(
    names.map(async (name, index) => {
      if (Number(name.slice(0, 3)) !== index + 1)
        throw new Error("Migration sequence invalid");
      const sql = await readFile(join(directory, name), "utf8");
      return {
        name,
        version: index + 1,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
  const pool = new Pool(await databaseConfiguration());
  const client = await pool.connect().catch(async (error) => {
    await pool.end();
    throw error;
  });
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1937010547,1)");
    await client.query("CREATE SCHEMA IF NOT EXISTS research");
    await client.query(
      "CREATE TABLE IF NOT EXISTS research.schema_migrations(version integer PRIMARY KEY,name text NOT NULL UNIQUE,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const applied = (
      await client.query(
        "SELECT version,name,checksum FROM research.schema_migrations ORDER BY version",
      )
    ).rows;
    for (const [index, row] of applied.entries()) {
      const expected = migrations[index];
      if (
        !expected ||
        expected.version !== row.version ||
        expected.name !== row.name ||
        expected.checksum !== row.checksum
      )
        throw new Error("Migration integrity failed");
    }
    await client.query("SET LOCAL search_path TO research,pg_catalog");
    for (const migration of migrations.slice(applied.length)) {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO research.schema_migrations(version,name,checksum) VALUES($1,$2,$3)",
        [migration.version, migration.name, migration.checksum],
      );
    }
    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        status: "schema_ready",
        version: migrations.length,
        applied: migrations.length - applied.length,
        cutoverEnabled: false,
      }),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { MigrationIntegrityError } from "./errors";

const migrationFiles = [
  "001_workflow_core.sql",
  "002_artifacts_reports_questions.sql",
  "003_fencing_idempotency.sql",
  "004_replacement_invariants.sql",
  "005_agent_output_commits.sql",
  "006_agent_launch_provenance.sql",
  "007_run_control.sql",
  "008_research_api.sql",
  "009_research_commands.sql",
  "010_us_ticker_symbols.sql",
  "011_agent_launch_policy_provenance.sql",
  "012_symbol_registry.sql",
  "013_attempt_web_evidence.sql",
  "014_terra_runtime_policy.sql",
  "015_snapshot_scoped_artifact_digests.sql",
  "016_replacement_budget_alignment.sql",
  "017_research_call_budget_34.sql",
  "018_luna_support_specialists.sql",
  "019_research_targets.sql",
  "020_research_profiles.sql",
  "021_research_room_views.sql",
  "022_research_recovery.sql",
  "023_research_call_budget_42.sql",
  "024_replacement_chain_budget.sql",
  "025_codex_token_usage.sql",
  "026_auxiliary_codex_usage.sql",
] as const;

export type OrderedMigration = {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly sql: string;
};

type AppliedMigrationRow = {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
};

export const defaultMigrationsDirectory = join(
  process.cwd(),
  "src/research/server/persistence/sqlite/migrations",
);

export function loadOrderedMigrations(
  directory = defaultMigrationsDirectory,
): readonly OrderedMigration[] {
  return migrationFiles.map((name, index) => {
    const sql = readFileSync(join(directory, name), "utf8");
    return Object.freeze({
      version: index + 1,
      name,
      checksum: createHash("sha256").update(sql).digest("hex"),
      sql,
    });
  });
}

function validateApplied(
  applied: readonly AppliedMigrationRow[],
  migrations: readonly OrderedMigration[],
): void {
  applied.forEach((row, index) => {
    const expected = migrations[index];
    if (expected === undefined)
      throw new MigrationIntegrityError(
        row.version,
        "database is newer than this binary",
      );
    if (row.version !== expected.version)
      throw new MigrationIntegrityError(
        row.version,
        "applied versions are not contiguous",
      );
    if (row.name !== expected.name || row.checksum !== expected.checksum)
      throw new MigrationIntegrityError(
        row.version,
        "name or checksum changed",
      );
  });
}

export function applyOrderedMigrations(
  database: Database.Database,
  directory = defaultMigrationsDirectory,
): void {
  const migrations = loadOrderedMigrations(directory);
  database.pragma("foreign_keys = OFF");
  try {
    database.exec("BEGIN IMMEDIATE");
    database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT`);
    const applied = database
      .prepare<[], AppliedMigrationRow>(
        "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
      )
      .all();
    validateApplied(applied, migrations);
    const insert = database.prepare<{
      readonly version: number;
      readonly name: string;
      readonly checksum: string;
    }>(`INSERT INTO schema_migrations(version, name, checksum, applied_at)
      VALUES (@version, @name, @checksum, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);
    for (const migration of migrations.slice(applied.length)) {
      database.exec(migration.sql);
      insert.run({
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
      });
    }
    const violations = database
      .prepare<[], unknown>("PRAGMA foreign_key_check")
      .all();
    if (violations.length > 0)
      throw new MigrationIntegrityError(
        migrations.length,
        "foreign-key check failed after migration",
      );
    database.exec("COMMIT");
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  } finally {
    database.pragma("foreign_keys = ON");
  }
}

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

const migrations = [
  {
    version: 1,
    name: "001_accounts_and_usage",
    sql: `
      CREATE TABLE app_users (
        principal_id CHAR(64) PRIMARY KEY,
        cognito_subject TEXT NOT NULL UNIQUE,
        username TEXT,
        email TEXT,
        display_name TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        CHECK (principal_id ~ '^[0-9a-f]{64}$')
      );

      CREATE TABLE entitlements (
        principal_id CHAR(64) PRIMARY KEY
          REFERENCES app_users(principal_id) ON DELETE CASCADE,
        plan_code TEXT NOT NULL DEFAULT 'preview',
        status TEXT NOT NULL DEFAULT 'active',
        research_run_limit INTEGER,
        consultation_limit_per_report INTEGER,
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled')),
        CHECK (research_run_limit IS NULL OR research_run_limit >= 0),
        CHECK (
          consultation_limit_per_report IS NULL
          OR consultation_limit_per_report >= 0
        )
      );

      CREATE TABLE research_run_ownership (
        run_id UUID PRIMARY KEY,
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE RESTRICT,
        symbol TEXT NOT NULL,
        locale TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL,
        CHECK (symbol ~ '^[A-Z]{1,5}$'),
        CHECK (locale IN ('en', 'ko'))
      );

      CREATE INDEX research_run_ownership_user_history_idx
        ON research_run_ownership(principal_id, created_at DESC, run_id DESC);

      CREATE TABLE usage_events (
        event_key TEXT PRIMARY KEY,
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE RESTRICT,
        kind TEXT NOT NULL,
        run_id UUID,
        report_id UUID,
        quantity INTEGER NOT NULL DEFAULT 1,
        occurred_at TIMESTAMPTZ NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        CHECK (kind IN ('research_run_created', 'consultation_answered')),
        CHECK (quantity > 0)
      );

      CREATE INDEX usage_events_user_time_idx
        ON usage_events(principal_id, occurred_at DESC);

      CREATE TABLE report_ownership (
        report_id UUID PRIMARY KEY,
        run_id UUID NOT NULL
          REFERENCES research_run_ownership(run_id) ON DELETE CASCADE,
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE RESTRICT,
        version_id UUID NOT NULL,
        version INTEGER NOT NULL,
        status TEXT NOT NULL,
        published_at TIMESTAMPTZ NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL,
        CHECK (version > 0)
      );

      CREATE INDEX report_ownership_user_published_idx
        ON report_ownership(principal_id, published_at DESC, report_id DESC);
    `,
  },
] as const;

type AppliedMigration = {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
};

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export async function applyPostgresAccountMigrations(
  client: PoolClient,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('stocksembly-account-migrations'))",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS stocksembly_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query<AppliedMigration>(
      `SELECT version, name, checksum
       FROM stocksembly_schema_migrations
       ORDER BY version`,
    );
    for (const [index, row] of applied.rows.entries()) {
      const expected = migrations[index];
      if (
        expected === undefined ||
        row.version !== expected.version ||
        row.name !== expected.name ||
        row.checksum !== checksum(expected.sql)
      ) {
        throw new Error("POSTGRES_ACCOUNT_MIGRATION_INTEGRITY_ERROR");
      }
    }
    for (const migration of migrations.slice(applied.rows.length)) {
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO stocksembly_schema_migrations(version, name, checksum)
         VALUES ($1, $2, $3)`,
        [migration.version, migration.name, checksum(migration.sql)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

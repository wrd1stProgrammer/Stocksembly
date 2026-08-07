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
  {
    version: 2,
    name: "002_durable_history_and_consultations",
    sql: `
      ALTER TABLE research_run_ownership
        ADD COLUMN public_run JSONB;

      CREATE TABLE report_consultations (
        question_id UUID PRIMARY KEY,
        report_id UUID NOT NULL,
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE RESTRICT,
        public_question JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL,
        CHECK (principal_id ~ '^[0-9a-f]{64}$')
      );

      CREATE INDEX report_consultations_user_report_idx
        ON report_consultations(principal_id, report_id, created_at, question_id);
    `,
  },
  {
    version: 3,
    name: "003_account_locale_preference",
    sql: `
      ALTER TABLE app_users
        ADD COLUMN preferred_locale TEXT;

      ALTER TABLE app_users
        ADD CONSTRAINT app_users_preferred_locale_check
        CHECK (
          preferred_locale IS NULL
          OR preferred_locale IN ('en', 'ko')
      );
    `,
  },
  {
    version: 4,
    name: "004_whop_billing_and_credits",
    sql: `
      ALTER TABLE app_users
        ADD COLUMN whop_user_id TEXT;

      CREATE UNIQUE INDEX app_users_whop_user_id_idx
        ON app_users(whop_user_id)
        WHERE whop_user_id IS NOT NULL;

      ALTER TABLE entitlements
        ADD COLUMN whop_membership_id TEXT,
        ADD COLUMN whop_plan_id TEXT,
        ADD COLUMN manage_url TEXT,
        ADD COLUMN cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN whop_event_at TIMESTAMPTZ,
        ADD COLUMN monthly_credit_limit INTEGER NOT NULL DEFAULT 0,
        ADD CONSTRAINT entitlements_monthly_credit_limit_check
          CHECK (monthly_credit_limit >= 0);

      CREATE UNIQUE INDEX entitlements_whop_membership_idx
        ON entitlements(whop_membership_id)
        WHERE whop_membership_id IS NOT NULL;

      CREATE TABLE whop_webhook_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        occurred_at TIMESTAMPTZ,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        payload JSONB NOT NULL
      );

      CREATE TABLE credit_grants (
        grant_key TEXT PRIMARY KEY,
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE CASCADE,
        period_key DATE NOT NULL,
        plan_code TEXT NOT NULL,
        credits INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE (principal_id, period_key),
        CHECK (credits >= 0)
      );

      CREATE INDEX credit_grants_user_period_idx
        ON credit_grants(principal_id, period_key DESC);
    `,
  },
  {
    version: 5,
    name: "005_credit_usage_counters",
    sql: `
      ALTER TABLE usage_events
        DROP CONSTRAINT usage_events_kind_check;

      ALTER TABLE usage_events
        ADD CONSTRAINT usage_events_kind_check CHECK (
          kind IN (
            'research_run_created',
            'consultation_answered',
            'full_research',
            'department_research',
            'chat_bundle',
            'research_room'
          )
        );

      CREATE TABLE chat_usage_counters (
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE CASCADE,
        period_key DATE NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (principal_id, period_key),
        CHECK (message_count >= 0)
      );
    `,
  },
  {
    version: 6,
    name: "006_credit_grant_ledger_and_room_idempotency",
    sql: `
      ALTER TABLE credit_grants
        DROP CONSTRAINT IF EXISTS credit_grants_principal_id_period_key_key;

      CREATE INDEX credit_grants_user_created_idx
        ON credit_grants(principal_id, created_at DESC, grant_key DESC);

      CREATE INDEX usage_events_research_room_report_idx
        ON usage_events(principal_id, report_id)
        WHERE kind = 'research_room';
    `,
  },
  {
    version: 7,
    name: "007_normalize_legacy_free_grants",
    sql: `
      UPDATE credit_grants
      SET plan_code = 'free_daily',
          updated_at = GREATEST(updated_at, now())
      WHERE plan_code = 'free';
    `,
  },
  {
    version: 8,
    name: "008_watchlists_and_daily_briefings",
    sql: `
      CREATE TABLE briefing_watchlist_items (
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE CASCADE,
        symbol TEXT NOT NULL,
        provider_code TEXT NOT NULL,
        company TEXT NOT NULL,
        exchange TEXT NOT NULL,
        position INTEGER NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (principal_id, symbol),
        CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
        CHECK (exchange IN ('NASDAQ', 'NYSE', 'NYSE_AMERICAN')),
        CHECK (position >= 0)
      );

      CREATE INDEX briefing_watchlist_active_symbol_idx
        ON briefing_watchlist_items(symbol, principal_id)
        WHERE active = true;

      CREATE TABLE briefing_source_snapshots (
        snapshot_id UUID PRIMARY KEY,
        symbol TEXT NOT NULL,
        market_date DATE NOT NULL,
        cutoff_at TIMESTAMPTZ NOT NULL,
        coverage_start TIMESTAMPTZ NOT NULL,
        content_hash CHAR(64) NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (symbol, market_date),
        CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
        CHECK (content_hash ~ '^[0-9a-f]{64}$')
      );

      CREATE TABLE briefing_editions (
        briefing_id UUID PRIMARY KEY,
        symbol TEXT NOT NULL,
        company TEXT NOT NULL,
        market_date DATE NOT NULL,
        locale TEXT NOT NULL,
        scheduled_for TIMESTAMPTZ NOT NULL,
        snapshot_id UUID NOT NULL
          REFERENCES briefing_source_snapshots(snapshot_id) ON DELETE RESTRICT,
        status TEXT NOT NULL,
        payload JSONB NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (symbol, market_date, locale),
        CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
        CHECK (locale IN ('en', 'ko')),
        CHECK (status IN ('ready', 'partial'))
      );

      CREATE INDEX briefing_editions_symbol_history_idx
        ON briefing_editions(symbol, locale, market_date DESC);

      CREATE TABLE briefing_deliveries (
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE CASCADE,
        briefing_id UUID NOT NULL
          REFERENCES briefing_editions(briefing_id) ON DELETE CASCADE,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        read_at TIMESTAMPTZ,
        PRIMARY KEY (principal_id, briefing_id)
      );

      CREATE INDEX briefing_deliveries_user_unread_idx
        ON briefing_deliveries(principal_id, delivered_at DESC)
        WHERE read_at IS NULL;
    `,
  },
  {
    version: 9,
    name: "009_append_only_briefing_history",
    sql: `
      ALTER TABLE briefing_source_snapshots
        DROP CONSTRAINT IF EXISTS briefing_source_snapshots_symbol_market_date_key;

      ALTER TABLE briefing_editions
        DROP CONSTRAINT IF EXISTS briefing_editions_symbol_market_date_locale_key;

      CREATE INDEX briefing_source_snapshots_symbol_history_idx
        ON briefing_source_snapshots(symbol, market_date DESC, cutoff_at DESC);

      CREATE INDEX briefing_editions_latest_idx
        ON briefing_editions(symbol, locale, generated_at DESC);
    `,
  },
  {
    version: 10,
    name: "010_monthly_briefing_watchlist_changes",
    sql: `
      CREATE TABLE briefing_watchlist_monthly_changes (
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE CASCADE,
        month_key DATE NOT NULL,
        change_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (principal_id, month_key),
        CHECK (change_count >= 0 AND change_count <= 10),
        CHECK (month_key = date_trunc('month', month_key)::date)
      );

      CREATE INDEX briefing_watchlist_changes_user_history_idx
        ON briefing_watchlist_monthly_changes(principal_id, month_key DESC);
    `,
  },
  {
    version: 11,
    name: "011_research_credit_reservations",
    sql: `
      CREATE TABLE research_credit_reservations (
        principal_id CHAR(64) NOT NULL
          REFERENCES app_users(principal_id) ON DELETE CASCADE,
        run_id UUID NOT NULL,
        period_key DATE NOT NULL,
        credits INTEGER NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (principal_id, run_id),
        CHECK (credits > 0)
      );

      CREATE INDEX research_credit_reservations_active_idx
        ON research_credit_reservations(principal_id, period_key, expires_at);
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

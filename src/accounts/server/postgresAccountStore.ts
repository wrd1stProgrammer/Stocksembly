import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { z } from "zod";
import type {
  BriefingAccess,
  BriefingAudience,
  BriefingEditionPayload,
  BriefingListItem,
  BriefingSourceSnapshot,
  BriefingWatchlistItem,
  SaveBriefingEdition,
} from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import type {
  BillingCreditActivity,
  BillingCreditNotice,
  BillingPlanKey,
  BillingTier,
} from "../../lib/whop/contracts";
import {
  CREDIT_COSTS,
  isSuccessfulResearchStatus,
  researchCreditCost,
  researchUsageCode,
} from "../../lib/whop/creditPolicy";
import {
  billingPlanKeyForPrice,
  billingPlanKeyForWhopPlanId,
  billingTierForPlanKey,
  FREE_DAILY_CREDIT_ALLOWANCE,
  FREE_MONTHLY_CREDIT_CAP,
  FREE_SIGNUP_CREDIT_ALLOWANCE,
  getWhopEnvironment,
  MONTHLY_CREDIT_ALLOWANCE,
} from "../../lib/whop/server";
import type {
  PublicReport,
  PublicRun,
  RunCursor,
} from "../../research/server/api/researchApiContracts";
import { PublicRunSchema } from "../../research/server/api/researchApiContracts";
import {
  type PublicQuestion,
  PublicQuestionSchema,
} from "../../research/server/api/researchCommandContracts";
import type { ResearchPrincipal } from "../../research/server/http/researchAuth";
import {
  type AccountBillingStatus,
  type AccountStore,
  AccountStoreUnavailableError,
  type CreditAvailability,
} from "./accountStore";
import { applyPostgresAccountMigrations } from "./postgresAccountMigrations";

const SecretSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().positive().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  dbname: z.string().min(1).optional(),
});

const FREE_CREDIT_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const BRIEFING_WATCHLIST_MONTHLY_CHANGE_LIMIT = 10;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object"
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function validPrincipalId(value: string | undefined): string | undefined {
  return value !== undefined && /^[0-9a-f]{64}$/u.test(value)
    ? value
    : undefined;
}

function billingPlanKey(value: string | undefined): BillingPlanKey | undefined {
  return value === "pro-monthly" ||
    value === "pro-annual" ||
    value === "ultra-monthly" ||
    value === "ultra-annual"
    ? value
    : undefined;
}

function manageUrlForCurrentWhopEnvironment(
  value: string | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;

  try {
    const url = new URL(value);
    const allowedHosts =
      getWhopEnvironment() === "sandbox"
        ? new Set(["sandbox.whop.com"])
        : new Set(["whop.com", "www.whop.com"]);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      !allowedHosts.has(url.hostname)
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function periodBounds(now: Date): {
  readonly start: Date;
  readonly end: Date;
  readonly key: string;
} {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return {
    start,
    end,
    key: start.toISOString().slice(0, 10),
  };
}

type CreditPeriodContext = {
  readonly tier: BillingTier;
  readonly status: AccountBillingStatus["status"];
  readonly allowance: number;
  readonly isFree: boolean;
  readonly bounds: ReturnType<typeof periodBounds>;
  readonly accountCreatedAt: string;
};

type CreditGrantRow = {
  readonly grant_key: string;
  readonly plan_code: string;
  readonly credits: number;
  readonly created_at: string;
};

async function creditPeriodContext(
  client: PoolClient,
  principalId: string,
  now: Date,
): Promise<CreditPeriodContext> {
  const result = await client.query<{
    plan_code: string;
    status: string;
    monthly_credit_limit: number | null;
    account_created_at: string;
  }>(
    `SELECT entitlements.plan_code,
            entitlements.status,
            entitlements.monthly_credit_limit,
            app_users.created_at AS account_created_at
     FROM entitlements
     JOIN app_users ON app_users.principal_id = entitlements.principal_id
     WHERE entitlements.principal_id = $1
     LIMIT 1`,
    [principalId],
  );
  const entitlement = result.rows[0];
  const rawStatus = billingStatus(entitlement?.status);
  const rawTier = tierForPlanCode(entitlement?.plan_code);
  const paidStatus = ["active", "trialing", "past_due"].includes(rawStatus);
  const tier = paidStatus ? rawTier : "free";
  const isFree = tier === "free";
  const bounds = periodBounds(now);
  const configuredAllowance = Number(entitlement?.monthly_credit_limit ?? 0);
  const allowance = isFree
    ? 0
    : configuredAllowance > 0
      ? configuredAllowance
      : MONTHLY_CREDIT_ALLOWANCE[tier];
  return {
    tier,
    status: rawStatus,
    allowance,
    isFree,
    bounds,
    accountCreatedAt: entitlement?.account_created_at ?? now.toISOString(),
  };
}

async function ensureCreditGrant(
  client: PoolClient,
  principalId: string,
  context: CreditPeriodContext,
  now: Date,
): Promise<CreditGrantRow | undefined> {
  if (!context.isFree) {
    if (context.allowance <= 0) return undefined;
    await client.query(
      `INSERT INTO credit_grants(
        grant_key, principal_id, period_key, plan_code, credits,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT (grant_key) DO UPDATE SET
        credits = GREATEST(credit_grants.credits, EXCLUDED.credits),
        plan_code = EXCLUDED.plan_code,
        updated_at = EXCLUDED.updated_at`,
      [
        `credit:${principalId}:${context.bounds.key}`,
        principalId,
        context.bounds.key,
        context.tier,
        context.allowance,
        now.toISOString(),
      ],
    );
    return undefined;
  }

  const existing = await client.query<CreditGrantRow>(
    `SELECT grant_key, plan_code, credits, created_at
     FROM credit_grants
     WHERE principal_id = $1
       AND plan_code IN ('free_signup', 'free_daily')
     ORDER BY created_at ASC, grant_key ASC`,
    [principalId],
  );
  let signupGrant = existing.rows.find(
    (grant) => grant.plan_code === "free_signup",
  );
  if (signupGrant === undefined) {
    const createdAt = Date.parse(context.accountCreatedAt);
    const grantAt = Number.isFinite(createdAt) ? new Date(createdAt) : now;
    const inserted = await client.query<CreditGrantRow>(
      `INSERT INTO credit_grants(
        grant_key, principal_id, period_key, plan_code, credits,
        created_at, updated_at
      ) VALUES ($1, $2, $3, 'free_signup', $4, $5, $5)
      ON CONFLICT (grant_key) DO NOTHING
      RETURNING grant_key, plan_code, credits, created_at`,
      [
        `free-signup:${principalId}`,
        principalId,
        grantAt.toISOString().slice(0, 10),
        FREE_SIGNUP_CREDIT_ALLOWANCE,
        grantAt.toISOString(),
      ],
    );
    signupGrant = inserted.rows[0] ?? {
      grant_key: `free-signup:${principalId}`,
      plan_code: "free_signup",
      credits: FREE_SIGNUP_CREDIT_ALLOWANCE,
      created_at: grantAt.toISOString(),
    };
  }

  const signupAt = Date.parse(signupGrant.created_at);
  if (!Number.isFinite(signupAt)) return signupGrant;

  const firstDailyEligibleAt = signupAt + FREE_CREDIT_INTERVAL_MS;
  // Older deployments could issue a daily grant before the sign-up grant was
  // backfilled. Remove only those impossible rows so the ledger and balance
  // agree again; valid daily grants remain untouched.
  await client.query(
    `DELETE FROM credit_grants
     WHERE principal_id = $1
       AND plan_code = 'free_daily'
       AND created_at < $2::timestamptz`,
    [principalId, new Date(firstDailyEligibleAt).toISOString()],
  );

  const validGrants = existing.rows.filter((grant) => {
    if (grant.plan_code !== "free_daily") return false;
    const createdAt = Date.parse(grant.created_at);
    return Number.isFinite(createdAt) && createdAt >= firstDailyEligibleAt;
  });
  const newestGrant =
    [...validGrants, signupGrant]
      .sort((left, right) => {
        const byTime =
          Date.parse(left.created_at) - Date.parse(right.created_at);
        return byTime !== 0
          ? byTime
          : left.grant_key.localeCompare(right.grant_key);
      })
      .at(-1) ?? signupGrant;
  const latestGrantAt = Date.parse(newestGrant.created_at);
  const nextDailyEligibleAt = Number.isFinite(latestGrantAt)
    ? latestGrantAt + FREE_CREDIT_INTERVAL_MS
    : firstDailyEligibleAt;
  if (
    now.getTime() < firstDailyEligibleAt ||
    now.getTime() < nextDailyEligibleAt
  )
    return newestGrant;

  const monthTotal = await client.query<{ granted: number }>(
    `SELECT COALESCE(SUM(credits), 0)::int AS granted
     FROM credit_grants
     WHERE principal_id = $1
       AND plan_code IN ('free_signup', 'free_daily')
       AND created_at >= $2::timestamptz
       AND created_at < $3::timestamptz`,
    [
      principalId,
      context.bounds.start.toISOString(),
      context.bounds.end.toISOString(),
    ],
  );
  const remainingMonthlyCap = Math.max(
    0,
    FREE_MONTHLY_CREDIT_CAP - Number(monthTotal.rows[0]?.granted ?? 0),
  );
  if (remainingMonthlyCap <= 0) return newestGrant;
  const inserted = await client.query<CreditGrantRow>(
    `INSERT INTO credit_grants(
      grant_key, principal_id, period_key, plan_code, credits,
      created_at, updated_at
    ) VALUES ($1, $2, $3, 'free_daily', $4, $5, $5)
    ON CONFLICT (grant_key) DO NOTHING
    RETURNING grant_key, plan_code, credits, created_at`,
    [
      `free-daily:${principalId}:${now.toISOString()}`,
      principalId,
      context.bounds.key,
      Math.min(FREE_DAILY_CREDIT_ALLOWANCE, remainingMonthlyCap),
      now.toISOString(),
    ],
  );
  return inserted.rows[0] ?? newestGrant;
}

async function usedCredits(
  client: PoolClient,
  principalId: string,
  context: CreditPeriodContext,
): Promise<number> {
  const result = await client.query<{ used: number }>(
    `SELECT COALESCE(SUM(quantity), 0)::int AS used
     FROM usage_events
     WHERE principal_id = $1
       AND occurred_at >= $2::timestamptz
       AND occurred_at < $3::timestamptz`,
    [
      principalId,
      context.bounds.start.toISOString(),
      context.bounds.end.toISOString(),
    ],
  );
  return Math.max(0, Number(result.rows[0]?.used ?? 0));
}

async function reservedResearchCredits(
  client: PoolClient,
  principalId: string,
  context: CreditPeriodContext,
  now: Date,
  excludedRunId?: string,
): Promise<number> {
  const result = await client.query<{ reserved: number }>(
    `SELECT COALESCE(SUM(credits), 0)::int AS reserved
     FROM research_credit_reservations
     WHERE principal_id = $1
       AND period_key = $2
       AND expires_at > $3::timestamptz
       AND ($4::uuid IS NULL OR run_id <> $4::uuid)`,
    [principalId, context.bounds.key, now.toISOString(), excludedRunId ?? null],
  );
  return Math.max(0, Number(result.rows[0]?.reserved ?? 0));
}

async function grantedCredits(
  client: PoolClient,
  principalId: string,
  context: CreditPeriodContext,
): Promise<number> {
  const planCodes = context.isFree
    ? ["free_signup", "free_daily"]
    : [context.tier];
  const result = await client.query<{ granted: number }>(
    `SELECT COALESCE(SUM(credits), 0)::int AS granted
     FROM credit_grants
     WHERE principal_id = $1
       AND plan_code = ANY($2::text[])
       AND created_at >= $3::timestamptz
       AND created_at < $4::timestamptz`,
    [
      principalId,
      planCodes,
      context.bounds.start.toISOString(),
      context.bounds.end.toISOString(),
    ],
  );
  return Math.max(0, Number(result.rows[0]?.granted ?? 0));
}

async function latestFreeGrantNotice(
  client: PoolClient,
  principalId: string,
  balance: number,
): Promise<BillingCreditNotice | undefined> {
  const result = await client.query<CreditGrantRow>(
    `SELECT grant_key, plan_code, credits, created_at
     FROM credit_grants
     WHERE principal_id = $1
       AND plan_code IN ('free_signup', 'free_daily')
     ORDER BY created_at DESC, grant_key DESC
     LIMIT 1`,
    [principalId],
  );
  const grant = result.rows[0];
  if (grant === undefined) return undefined;
  return {
    id: grant.grant_key,
    kind: grant.plan_code === "free_signup" ? "signup" : "daily",
    amount: Number(grant.credits),
    grantedAt: new Date(grant.created_at).toISOString(),
    balance,
  };
}

function availability(remaining: number, required: number): CreditAvailability {
  return {
    allowed: remaining >= required,
    remaining,
    required,
  };
}

function activityCode(
  kind: "grant" | "usage",
  code: string,
): BillingCreditActivity["code"] {
  if (kind === "grant") {
    if (code === "free_signup") return "free_signup_grant";
    if (code === "pro") return "pro_monthly_grant";
    if (code === "ultra") return "ultra_monthly_grant";
    return "free_daily_grant";
  }
  switch (code) {
    case "full_research":
      return "full_research";
    case "department_research":
      return "department_research";
    case "chat_bundle":
      return "chat_bundle";
    case "research_room":
      return "research_room";
    case "consultation_answered":
      return "consultation";
    default:
      return "research_run";
  }
}

function billingStatus(
  value: string | undefined,
): AccountBillingStatus["status"] {
  return value === "active" ||
    value === "trialing" ||
    value === "past_due" ||
    value === "cancelled"
    ? value
    : "none";
}

function tierForPlanCode(value: string | undefined): BillingTier {
  return value === "pro" || value === "ultra" ? value : "free";
}

function watchlistLimit(tier: BillingTier, status: string | undefined): number {
  if (status !== "active" && status !== "trialing") return 0;
  if (tier === "ultra") return 10;
  if (tier === "pro") return 3;
  return 0;
}

function briefingWatchlistItem(row: {
  symbol: string;
  provider_code: string;
  company: string;
  exchange: string;
  position: number;
  created_at: string;
}): BriefingWatchlistItem {
  const exchange =
    row.exchange === "NYSE" || row.exchange === "NYSE_AMERICAN"
      ? row.exchange
      : "NASDAQ";
  return Object.freeze({
    symbol: row.symbol,
    providerCode: row.provider_code,
    company: row.company,
    exchange,
    position: Number(row.position),
    createdAt: new Date(row.created_at).toISOString(),
  });
}

function nextEarningsFor(
  payload: BriefingEditionPayload,
): BriefingListItem["nextEarnings"] {
  const confirmedEvent = payload.upcomingEvents.find(
    (event) =>
      event.certainty === "confirmed" &&
      /earnings|results|실적/iu.test(event.name),
  );
  if (confirmedEvent !== undefined) return confirmedEvent;
  if (
    payload.earnings?.nextReportAt !== undefined &&
    payload.earnings.nextReportCertainty === "confirmed"
  )
    return {
      name: "Earnings",
      scheduledAt: payload.earnings.nextReportAt,
      whyItMatters: "Next scheduled earnings release",
      certainty: "confirmed",
    };
  return undefined;
}

async function briefingWatchlistChangeCount(
  client: PoolClient,
  principalId: string,
): Promise<number> {
  const result = await client.query<{ change_count: number }>(
    `SELECT change_count
     FROM briefing_watchlist_monthly_changes
     WHERE principal_id = $1
       AND month_key = date_trunc('month', now())::date
     FOR UPDATE`,
    [principalId],
  );
  return Number(result.rows[0]?.change_count ?? 0);
}

async function recordBriefingWatchlistChange(
  client: PoolClient,
  principalId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO briefing_watchlist_monthly_changes(
       principal_id, month_key, change_count
     ) VALUES ($1, date_trunc('month', now())::date, 1)
     ON CONFLICT (principal_id, month_key) DO UPDATE SET
       change_count = briefing_watchlist_monthly_changes.change_count + 1,
       updated_at = now()`,
    [principalId],
  );
}

function isoTimestamp(value: string | undefined, fallback: Date): string {
  const parsed = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString()
    : fallback.toISOString();
}

async function poolConfiguration(): Promise<PoolConfig | undefined> {
  const connectionString = process.env["STOCKSEMBLY_DATABASE_URL"];
  if (connectionString) {
    return {
      connectionString,
      max: 4,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      ...(process.env["STOCKSEMBLY_DATABASE_SSL"] === "true"
        ? { ssl: { rejectUnauthorized: true } }
        : {}),
    };
  }

  const secretArn = process.env["STOCKSEMBLY_DB_SECRET_ARN"];
  if (!secretArn) return undefined;
  const region = process.env["AWS_REGION"];
  if (!region) throw new Error("AWS_REGION_REQUIRED_FOR_DATABASE_SECRET");
  const secrets = new SecretsManagerClient({ region });
  try {
    const response = await secrets.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );
    if (!response.SecretString) throw new Error("DATABASE_SECRET_EMPTY");
    const secret = SecretSchema.parse(JSON.parse(response.SecretString));
    const host = process.env["STOCKSEMBLY_DB_HOST"] ?? secret.host;
    if (!host) throw new Error("STOCKSEMBLY_DB_HOST_REQUIRED");
    const certificateAuthority = await readFile(
      process.env["STOCKSEMBLY_DB_CA_PATH"] ??
        "/etc/ssl/certs/aws-rds-global-bundle.pem",
      "utf8",
    );
    return {
      host,
      port:
        Number.parseInt(process.env["STOCKSEMBLY_DB_PORT"] ?? "", 10) ||
        secret.port ||
        5432,
      user: secret.username,
      password: secret.password,
      database:
        process.env["STOCKSEMBLY_DB_NAME"] ?? secret.dbname ?? "stocksembly",
      ssl: { ca: certificateAuthority, rejectUnauthorized: true },
      max: 4,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    };
  } finally {
    secrets.destroy();
  }
}

export class PostgresAccountStore implements AccountStore {
  readonly #recordedReports = new Map<string, number>();
  readonly #recordedRuns = new Map<string, string>();
  readonly #syncedUsers = new Map<string, number>();

  private constructor(private readonly pool: Pool) {}

  static async create(
    configuration: PoolConfig,
  ): Promise<PostgresAccountStore> {
    const pool = new Pool(configuration);
    try {
      const client = await pool.connect();
      try {
        await applyPostgresAccountMigrations(client);
      } finally {
        client.release();
      }
      return new PostgresAccountStore(pool);
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  async syncUser(
    principal: ResearchPrincipal,
    observedAt: string,
  ): Promise<void> {
    const observedAtMilliseconds = Date.parse(observedAt);
    const lastSync = this.#syncedUsers.get(principal.id);
    if (
      lastSync !== undefined &&
      Number.isFinite(observedAtMilliseconds) &&
      observedAtMilliseconds - lastSync < 5 * 60 * 1_000
    ) {
      return;
    }
    const subject =
      principal.kind === "cognito"
        ? principal.subject
        : `local-development:${principal.id}`;
    if (subject === undefined) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const insertedUser = await client.query<{ created_at: string }>(
        `INSERT INTO app_users(
          principal_id, cognito_subject, username, email, display_name,
          created_at, updated_at, last_seen_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
        ON CONFLICT (principal_id) DO UPDATE SET
          username = COALESCE(EXCLUDED.username, app_users.username),
          email = COALESCE(EXCLUDED.email, app_users.email),
          display_name = COALESCE(EXCLUDED.display_name, app_users.display_name),
          updated_at = CASE
            WHEN app_users.last_seen_at < EXCLUDED.last_seen_at - interval '15 minutes'
            THEN EXCLUDED.updated_at ELSE app_users.updated_at END,
          last_seen_at = GREATEST(app_users.last_seen_at, EXCLUDED.last_seen_at)
        RETURNING created_at`,
        [
          principal.id,
          subject,
          principal.username ??
            (principal.kind === "local" ? "local-development" : null),
          principal.email ?? null,
          principal.displayName ?? null,
          observedAt,
        ],
      );
      await client.query(
        `INSERT INTO entitlements(
          principal_id, plan_code, status, created_at, updated_at
        ) VALUES ($1, 'preview', 'active', $2, $2)
        ON CONFLICT (principal_id) DO NOTHING`,
        [principal.id, observedAt],
      );
      // The sign-up grant is created with the account, rather than waiting
      // for the first billing page visit. The idempotent key keeps retries
      // from issuing the welcome credits twice.
      if (insertedUser.rowCount === 1) {
        const accountCreatedAt = isoTimestamp(
          insertedUser.rows[0]?.created_at,
          new Date(),
        );
        await client.query(
          `INSERT INTO credit_grants(
            grant_key, principal_id, period_key, plan_code, credits,
            created_at, updated_at
          ) VALUES ($1, $2, $3, 'free_signup', $4, $5, $5)
          ON CONFLICT (grant_key) DO NOTHING`,
          [
            `free-signup:${principal.id}`,
            principal.id,
            accountCreatedAt.slice(0, 10),
            FREE_SIGNUP_CREDIT_ALLOWANCE,
            accountCreatedAt,
          ],
        );
      }
      await client.query("COMMIT");
      this.#syncedUsers.set(
        principal.id,
        Number.isFinite(observedAtMilliseconds)
          ? observedAtMilliseconds
          : Date.now(),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError("ACCOUNT_USER_SYNC_FAILED", {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  async recordResearchRun(principalId: string, run: PublicRun): Promise<void> {
    if (this.#recordedRuns.get(run.runId) === run.status) return;
    const recordedAt = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO research_run_ownership(
          run_id, principal_id, symbol, locale, status, created_at, recorded_at,
          public_run
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (run_id) DO UPDATE SET
          status = EXCLUDED.status,
          recorded_at = EXCLUDED.recorded_at,
          public_run = EXCLUDED.public_run`,
        [
          run.runId,
          principalId,
          run.symbol,
          run.locale,
          run.status,
          run.createdAt,
          recordedAt,
          JSON.stringify(run),
        ],
      );
      if (isSuccessfulResearchStatus(run.status)) {
        const target = run.researchTarget;
        await client.query(
          `INSERT INTO usage_events(
            event_key, principal_id, kind, run_id, quantity, occurred_at, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
          ON CONFLICT (event_key) DO NOTHING`,
          [
            `research-completed:${run.runId}`,
            principalId,
            researchUsageCode(target),
            run.runId,
            researchCreditCost(target),
            recordedAt,
            JSON.stringify({
              symbol: run.symbol,
              locale: run.locale,
              researchTarget: target,
            }),
          ],
        );
      }
      if (
        isSuccessfulResearchStatus(run.status) ||
        run.status === "cancelled" ||
        run.status === "failed" ||
        run.status === "incomplete"
      )
        await client.query(
          `DELETE FROM research_credit_reservations
           WHERE principal_id = $1 AND run_id = $2`,
          [principalId, run.runId],
        );
      await client.query("COMMIT");
      this.#recordedRuns.set(run.runId, run.status);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError("ACCOUNT_RUN_RECORD_FAILED", {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  async reserveResearchCredits(
    principalId: string,
    runId: string,
    required: number,
  ): Promise<CreditAvailability> {
    const normalizedRequired = Math.max(0, Math.trunc(required));
    const now = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT principal_id FROM entitlements
         WHERE principal_id = $1 FOR UPDATE`,
        [principalId],
      );
      await client.query(
        `DELETE FROM research_credit_reservations
         WHERE principal_id = $1 AND expires_at <= $2::timestamptz`,
        [principalId, now.toISOString()],
      );
      const context = await creditPeriodContext(client, principalId, now);
      await ensureCreditGrant(client, principalId, context, now);
      const used = await usedCredits(client, principalId, context);
      const granted = await grantedCredits(client, principalId, context);
      const reserved = await reservedResearchCredits(
        client,
        principalId,
        context,
        now,
        runId,
      );
      const remaining = Math.max(0, granted - used - reserved);
      if (remaining < normalizedRequired) {
        await client.query("COMMIT");
        return availability(remaining, normalizedRequired);
      }
      if (normalizedRequired > 0)
        await client.query(
          `INSERT INTO research_credit_reservations(
            principal_id, run_id, period_key, credits, expires_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (principal_id, run_id) DO NOTHING`,
          [
            principalId,
            runId,
            context.bounds.key,
            normalizedRequired,
            new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
            now.toISOString(),
          ],
        );
      await client.query("COMMIT");
      return availability(remaining, normalizedRequired);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError(
        "ACCOUNT_RESEARCH_CREDIT_RESERVATION_FAILED",
        { cause: error },
      );
    } finally {
      client.release();
    }
  }

  async releaseResearchCredits(
    principalId: string,
    runId: string,
  ): Promise<void> {
    try {
      await this.pool.query(
        `DELETE FROM research_credit_reservations
         WHERE principal_id = $1 AND run_id = $2`,
        [principalId, runId],
      );
    } catch (error) {
      throw new AccountStoreUnavailableError(
        "ACCOUNT_RESEARCH_CREDIT_RELEASE_FAILED",
        { cause: error },
      );
    }
  }

  async checkCredits(
    principalId: string,
    required: number,
  ): Promise<CreditAvailability> {
    const normalizedRequired = Math.max(0, Math.trunc(required));
    const now = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT principal_id
         FROM entitlements
         WHERE principal_id = $1
         FOR UPDATE`,
        [principalId],
      );
      const context = await creditPeriodContext(client, principalId, now);
      await ensureCreditGrant(client, principalId, context, now);
      const used = await usedCredits(client, principalId, context);
      const granted = await grantedCredits(client, principalId, context);
      const reserved = await reservedResearchCredits(
        client,
        principalId,
        context,
        now,
      );
      const result = availability(
        Math.max(0, granted - used - reserved),
        normalizedRequired,
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError("ACCOUNT_CREDIT_CHECK_FAILED", {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  async checkChatCredits(principalId: string): Promise<CreditAvailability> {
    const now = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT principal_id
         FROM entitlements
         WHERE principal_id = $1
         FOR UPDATE`,
        [principalId],
      );
      const context = await creditPeriodContext(client, principalId, now);
      await ensureCreditGrant(client, principalId, context, now);
      await client.query(
        `INSERT INTO chat_usage_counters(
          principal_id, period_key, message_count, updated_at
        ) VALUES ($1, $2, 0, $3)
        ON CONFLICT (principal_id, period_key) DO NOTHING`,
        [principalId, context.bounds.key, now.toISOString()],
      );
      const counter = await client.query<{ message_count: number }>(
        `SELECT message_count
         FROM chat_usage_counters
         WHERE principal_id = $1 AND period_key = $2
         FOR UPDATE`,
        [principalId, context.bounds.key],
      );
      const nextCount = Number(counter.rows[0]?.message_count ?? 0) + 1;
      const required =
        nextCount % CREDIT_COSTS.chatBundleSize === 0
          ? CREDIT_COSTS.chatBundle
          : 1;
      const used = await usedCredits(client, principalId, context);
      const granted = await grantedCredits(client, principalId, context);
      const reserved = await reservedResearchCredits(
        client,
        principalId,
        context,
        now,
      );
      const result = availability(
        Math.max(0, granted - used - reserved),
        required,
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError(
        "ACCOUNT_CHAT_CREDIT_CHECK_FAILED",
        { cause: error },
      );
    } finally {
      client.release();
    }
  }

  async consumeResearchRoomCredit(
    principalId: string,
    eventKey: string,
    reportId: string,
  ): Promise<CreditAvailability> {
    const now = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT principal_id
         FROM entitlements
         WHERE principal_id = $1
         FOR UPDATE`,
        [principalId],
      );
      const context = await creditPeriodContext(client, principalId, now);
      await ensureCreditGrant(client, principalId, context, now);
      const used = await usedCredits(client, principalId, context);
      const granted = await grantedCredits(client, principalId, context);
      const reserved = await reservedResearchCredits(
        client,
        principalId,
        context,
        now,
      );
      const remaining = Math.max(0, granted - used - reserved);
      const required = CREDIT_COSTS.researchRoomView;
      const alreadyViewed = await client.query(
        `SELECT 1
         FROM usage_events
         WHERE principal_id = $1
           AND kind = 'research_room'
           AND report_id = $2
         LIMIT 1`,
        [principalId, reportId],
      );
      if (alreadyViewed.rows.length > 0) {
        await client.query("COMMIT");
        return availability(remaining, 0);
      }
      if (remaining < required) {
        await client.query("COMMIT");
        return availability(remaining, required);
      }
      const inserted = await client.query(
        `INSERT INTO usage_events(
          event_key, principal_id, kind, report_id, quantity,
          occurred_at, metadata
        ) VALUES ($1, $2, 'research_room', $3, $4, $5, $6::jsonb)
        ON CONFLICT (event_key) DO NOTHING
        RETURNING event_key`,
        [
          eventKey,
          principalId,
          reportId,
          required,
          now.toISOString(),
          JSON.stringify({ reportId }),
        ],
      );
      await client.query("COMMIT");
      return availability(
        inserted.rows.length === 0 ? remaining : remaining - required,
        inserted.rows.length === 0 ? 0 : required,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError(
        "ACCOUNT_RESEARCH_ROOM_CREDIT_FAILED",
        { cause: error },
      );
    } finally {
      client.release();
    }
  }

  async listResearchRuns(
    principalId: string,
    limit: number,
    cursor?: RunCursor,
  ): Promise<readonly PublicRun[]> {
    try {
      const result = await this.pool.query<{ public_run: unknown }>(
        `SELECT public_run
         FROM research_run_ownership
         WHERE principal_id = $1
           AND public_run IS NOT NULL
           AND (
             $2::timestamptz IS NULL
             OR created_at < $2::timestamptz
             OR (created_at = $2::timestamptz AND run_id < $3::uuid)
           )
         ORDER BY created_at DESC, run_id DESC
         LIMIT $4`,
        [principalId, cursor?.createdAt ?? null, cursor?.runId ?? null, limit],
      );
      return result.rows.map((row) => PublicRunSchema.parse(row.public_run));
    } catch (error) {
      throw new AccountStoreUnavailableError("ACCOUNT_RUN_LIST_FAILED", {
        cause: error,
      });
    }
  }

  async recordReportOwnership(
    principalId: string,
    report: PublicReport,
  ): Promise<void> {
    if (this.#recordedReports.get(report.reportId) === report.version) return;
    try {
      await this.pool.query(
        `INSERT INTO report_ownership(
        report_id, run_id, principal_id, version_id, version, status,
        published_at, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (report_id) DO UPDATE SET
        version_id = EXCLUDED.version_id,
        version = EXCLUDED.version,
        status = EXCLUDED.status,
        published_at = EXCLUDED.published_at,
        recorded_at = now()`,
        [
          report.reportId,
          report.runId,
          principalId,
          report.versionId,
          report.version,
          report.status,
          report.publishedAt,
        ],
      );
      this.#recordedReports.set(report.reportId, report.version);
    } catch (error) {
      throw new AccountStoreUnavailableError("ACCOUNT_REPORT_RECORD_FAILED", {
        cause: error,
      });
    }
  }

  async recordConsultation(
    principalId: string,
    question: PublicQuestion,
  ): Promise<void> {
    const now = new Date();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SELECT principal_id
         FROM entitlements
         WHERE principal_id = $1
         FOR UPDATE`,
        [principalId],
      );
      const insertedQuestion = await client.query<{ question_id: string }>(
        `INSERT INTO report_consultations(
          question_id, report_id, principal_id, public_question,
          created_at, recorded_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
        ON CONFLICT (question_id) DO NOTHING
        RETURNING question_id`,
        [
          question.questionId,
          question.reportId,
          principalId,
          JSON.stringify(question),
          question.createdAt,
          now.toISOString(),
        ],
      );
      if (insertedQuestion.rows.length > 0) {
        const context = await creditPeriodContext(client, principalId, now);
        await ensureCreditGrant(client, principalId, context, now);
        await client.query(
          `INSERT INTO chat_usage_counters(
            principal_id, period_key, message_count, updated_at
          ) VALUES ($1, $2, 1, $3)
          ON CONFLICT (principal_id, period_key) DO UPDATE SET
            message_count = chat_usage_counters.message_count + 1,
            updated_at = EXCLUDED.updated_at`,
          [principalId, context.bounds.key, now.toISOString()],
        );
        const counter = await client.query<{ message_count: number }>(
          `SELECT message_count
           FROM chat_usage_counters
           WHERE principal_id = $1 AND period_key = $2
           FOR UPDATE`,
          [principalId, context.bounds.key],
        );
        const messageCount = Number(counter.rows[0]?.message_count ?? 0);
        if (messageCount % CREDIT_COSTS.chatBundleSize === 0) {
          await client.query(
            `INSERT INTO usage_events(
              event_key, principal_id, kind, report_id, quantity,
              occurred_at, metadata
            ) VALUES ($1, $2, 'chat_bundle', $3, $4, $5, $6::jsonb)
            ON CONFLICT (event_key) DO NOTHING`,
            [
              `chat:${principalId}:${context.bounds.key}:${messageCount}`,
              principalId,
              question.reportId,
              CREDIT_COSTS.chatBundle,
              now.toISOString(),
              JSON.stringify({
                questionId: question.questionId,
                messageCount,
                bundleSize: CREDIT_COSTS.chatBundleSize,
              }),
            ],
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError(
        "ACCOUNT_CONSULTATION_RECORD_FAILED",
        { cause: error },
      );
    } finally {
      client.release();
    }
  }

  async listConsultations(
    principalId: string,
    reportId: string,
  ): Promise<readonly PublicQuestion[]> {
    try {
      const result = await this.pool.query<{ public_question: unknown }>(
        `SELECT public_question
         FROM report_consultations
         WHERE principal_id = $1 AND report_id = $2
         ORDER BY created_at, question_id`,
        [principalId, reportId],
      );
      return result.rows.map((row) =>
        PublicQuestionSchema.parse(row.public_question),
      );
    } catch (error) {
      throw new AccountStoreUnavailableError(
        "ACCOUNT_CONSULTATION_LIST_FAILED",
        { cause: error },
      );
    }
  }

  async billingStatus(principalId: string): Promise<AccountBillingStatus> {
    const now = new Date();
    const bounds = periodBounds(now);
    try {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `SELECT principal_id
           FROM entitlements
           WHERE principal_id = $1
           FOR UPDATE`,
          [principalId],
        );
        const context = await creditPeriodContext(client, principalId, now);
        await ensureCreditGrant(client, principalId, context, now);
        const used = await usedCredits(client, principalId, context);
        const allowance = await grantedCredits(client, principalId, context);
        const reserved = await reservedResearchCredits(
          client,
          principalId,
          context,
          now,
        );
        const remaining = Math.max(0, allowance - used - reserved);
        const creditAllowance = context.isFree
          ? FREE_MONTHLY_CREDIT_CAP
          : allowance;
        const entitlementResult = await client.query<{
          whop_plan_id: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          manage_url: string | null;
        }>(
          `SELECT whop_plan_id, current_period_start, current_period_end,
                  cancel_at_period_end, manage_url
           FROM entitlements
           WHERE principal_id = $1
           FOR UPDATE`,
          [principalId],
        );
        const entitlement = entitlementResult.rows[0];
        const activity = await client.query<{
          activity_id: string;
          kind: "grant" | "usage";
          code: string;
          amount: number;
          occurred_at: string;
        }>(
          `SELECT activity_id, kind, code, amount, occurred_at
           FROM (
             SELECT grant_key AS activity_id,
                    'grant'::text AS kind,
                    plan_code AS code,
                    credits AS amount,
                    created_at AS occurred_at
             FROM credit_grants
             WHERE principal_id = $1
             UNION ALL
             SELECT event_key AS activity_id,
                    'usage'::text AS kind,
                    kind AS code,
                    -quantity AS amount,
                    occurred_at
             FROM usage_events
             WHERE principal_id = $1
           ) AS credit_activity
           ORDER BY occurred_at DESC, activity_id DESC
           LIMIT 10`,
          [principalId],
        );
        const notice = context.isFree
          ? await latestFreeGrantNotice(client, principalId, remaining)
          : undefined;
        await client.query("COMMIT");
        const planKey = billingPlanKeyForWhopPlanId(
          entitlement?.whop_plan_id ?? undefined,
        );
        const manageUrl = manageUrlForCurrentWhopEnvironment(
          entitlement?.manage_url,
        );
        const tier = context.tier;
        return {
          tier,
          status: context.status,
          credits: {
            remaining,
            allowance: creditAllowance,
            used,
            usedPercent:
              creditAllowance === 0
                ? 0
                : Math.min(
                    100,
                    Math.round((used / creditAllowance) * 1000) / 10,
                  ),
            periodStart: bounds.start.toISOString(),
            periodEnd: bounds.end.toISOString(),
          },
          recentActivity: activity.rows.map((row) => ({
            id: row.activity_id,
            kind: row.kind,
            code: activityCode(row.kind, row.code),
            amount: Number(row.amount),
            occurredAt: new Date(row.occurred_at).toISOString(),
          })),
          ...(notice === undefined ? {} : { creditNotice: notice }),
          ...(entitlement?.whop_plan_id
            ? { planId: entitlement.whop_plan_id }
            : {}),
          ...(planKey === undefined ? {} : { planKey }),
          ...(entitlement?.current_period_start
            ? { currentPeriodStart: entitlement.current_period_start }
            : {}),
          ...(entitlement?.current_period_end
            ? { currentPeriodEnd: entitlement.current_period_end }
            : {}),
          ...(entitlement?.cancel_at_period_end
            ? { cancelAtPeriodEnd: true }
            : {}),
          ...(manageUrl === undefined ? {} : { manageUrl }),
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof AccountStoreUnavailableError) throw error;
      throw new AccountStoreUnavailableError("ACCOUNT_BILLING_STATUS_FAILED", {
        cause: error,
      });
    }
  }

  async researchRoomAccess(principalId: string): Promise<"free" | "paid"> {
    const status = await this.billingStatus(principalId);
    return status.tier === "free" ? "free" : "paid";
  }

  async briefingAccess(principalId: string): Promise<BriefingAccess> {
    try {
      const result = await this.pool.query<{
        plan_code: string;
        status: string;
        change_count: number;
      }>(
        `SELECT e.plan_code, e.status, COALESCE(c.change_count, 0)::int AS change_count
         FROM entitlements e
         LEFT JOIN briefing_watchlist_monthly_changes c
           ON c.principal_id = e.principal_id
          AND c.month_key = date_trunc('month', now())::date
         WHERE e.principal_id = $1`,
        [principalId],
      );
      const row = result.rows[0];
      const tier = tierForPlanCode(row?.plan_code);
      const limit = watchlistLimit(tier, row?.status);
      return {
        authenticated: true,
        tier,
        enabled: limit > 0,
        watchlistLimit: limit,
        watchlistChangesRemaining: Math.max(
          0,
          BRIEFING_WATCHLIST_MONTHLY_CHANGE_LIMIT -
            Number(row?.change_count ?? 0),
        ),
      };
    } catch (error) {
      throw new AccountStoreUnavailableError("BRIEFING_ACCESS_READ_FAILED", {
        cause: error,
      });
    }
  }

  async listBriefingWatchlist(
    principalId: string,
  ): Promise<readonly BriefingWatchlistItem[]> {
    try {
      const result = await this.pool.query<{
        symbol: string;
        provider_code: string;
        company: string;
        exchange: string;
        position: number;
        created_at: string;
      }>(
        `SELECT symbol, provider_code, company, exchange, position, created_at
         FROM briefing_watchlist_items
         WHERE principal_id = $1 AND active = true
         ORDER BY position, created_at, symbol`,
        [principalId],
      );
      return Object.freeze(result.rows.map(briefingWatchlistItem));
    } catch (error) {
      throw new AccountStoreUnavailableError("BRIEFING_WATCHLIST_READ_FAILED", {
        cause: error,
      });
    }
  }

  async addBriefingWatchlistItem(
    principalId: string,
    item: Omit<BriefingWatchlistItem, "position" | "createdAt">,
  ): Promise<
    | { readonly kind: "added"; readonly item: BriefingWatchlistItem }
    | { readonly kind: "exists"; readonly item: BriefingWatchlistItem }
    | { readonly kind: "limit"; readonly limit: number }
    | { readonly kind: "change_limit"; readonly remaining: 0 }
    | { readonly kind: "forbidden" }
  > {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const entitlement = await client.query<{
        plan_code: string;
        status: string;
      }>(
        `SELECT plan_code, status
         FROM entitlements
         WHERE principal_id = $1
         FOR UPDATE`,
        [principalId],
      );
      const row = entitlement.rows[0];
      const limit = watchlistLimit(
        tierForPlanCode(row?.plan_code),
        row?.status,
      );
      if (limit === 0) {
        await client.query("ROLLBACK");
        return { kind: "forbidden" };
      }
      const existing = await client.query<{
        symbol: string;
        provider_code: string;
        company: string;
        exchange: string;
        position: number;
        created_at: string;
        active: boolean;
      }>(
        `SELECT symbol, provider_code, company, exchange, position, created_at,
                active
         FROM briefing_watchlist_items
         WHERE principal_id = $1 AND symbol = $2`,
        [principalId, item.symbol],
      );
      const existingItem = existing.rows[0];
      if (existingItem?.active === true) {
        await client.query("COMMIT");
        return {
          kind: "exists",
          item: briefingWatchlistItem(existingItem),
        };
      }
      const count = await client.query<{
        count: number;
        next_position: number;
      }>(
        `SELECT COUNT(*)::int AS count,
                COALESCE(MAX(position), -1)::int + 1 AS next_position
         FROM briefing_watchlist_items
         WHERE principal_id = $1 AND active = true`,
        [principalId],
      );
      if (Number(count.rows[0]?.count ?? 0) >= limit) {
        await client.query("ROLLBACK");
        return { kind: "limit", limit };
      }
      const changeCount = await briefingWatchlistChangeCount(
        client,
        principalId,
      );
      if (changeCount >= BRIEFING_WATCHLIST_MONTHLY_CHANGE_LIMIT) {
        await client.query("ROLLBACK");
        return { kind: "change_limit", remaining: 0 };
      }
      if (existingItem !== undefined) {
        const updated = await client.query<{
          symbol: string;
          provider_code: string;
          company: string;
          exchange: string;
          position: number;
          created_at: string;
        }>(
          `UPDATE briefing_watchlist_items
           SET active = true, provider_code = $3, company = $4, exchange = $5,
               position = $6, created_at = now(), updated_at = now()
           WHERE principal_id = $1 AND symbol = $2
           RETURNING symbol, provider_code, company, exchange, position, created_at`,
          [
            principalId,
            item.symbol,
            item.providerCode,
            item.company,
            item.exchange,
            Number(count.rows[0]?.next_position ?? 0),
          ],
        );
        await recordBriefingWatchlistChange(client, principalId);
        await client.query("COMMIT");
        return {
          kind: "exists",
          item: briefingWatchlistItem(updated.rows[0]!),
        };
      }
      const inserted = await client.query<{
        symbol: string;
        provider_code: string;
        company: string;
        exchange: string;
        position: number;
        created_at: string;
      }>(
        `INSERT INTO briefing_watchlist_items(
           principal_id, symbol, provider_code, company, exchange, position
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING symbol, provider_code, company, exchange, position, created_at`,
        [
          principalId,
          item.symbol,
          item.providerCode,
          item.company,
          item.exchange,
          Number(count.rows[0]?.next_position ?? 0),
        ],
      );
      await recordBriefingWatchlistChange(client, principalId);
      await client.query("COMMIT");
      return {
        kind: "added",
        item: briefingWatchlistItem(inserted.rows[0]!),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError("BRIEFING_WATCHLIST_ADD_FAILED", {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  async removeBriefingWatchlistItem(
    principalId: string,
    symbol: string,
  ): Promise<{
    readonly removed: boolean;
    readonly changesRemaining: number;
    readonly limitReached?: boolean;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const entitlement = await client.query<{
        plan_code: string;
        status: string;
      }>(
        `SELECT plan_code, status
         FROM entitlements
         WHERE principal_id = $1
         FOR UPDATE`,
        [principalId],
      );
      const access = entitlement.rows[0];
      if (
        watchlistLimit(tierForPlanCode(access?.plan_code), access?.status) === 0
      ) {
        await client.query("ROLLBACK");
        return {
          removed: false,
          changesRemaining: 0,
          limitReached: true,
        };
      }
      const changeCount = await briefingWatchlistChangeCount(
        client,
        principalId,
      );
      if (changeCount >= BRIEFING_WATCHLIST_MONTHLY_CHANGE_LIMIT) {
        await client.query("ROLLBACK");
        return {
          removed: false,
          changesRemaining: 0,
          limitReached: true,
        };
      }
      const result = await client.query(
        `UPDATE briefing_watchlist_items
         SET active = false, updated_at = now()
         WHERE principal_id = $1 AND symbol = $2 AND active = true`,
        [principalId, symbol],
      );
      const removed = (result.rowCount ?? 0) > 0;
      if (removed) await recordBriefingWatchlistChange(client, principalId);
      await client.query("COMMIT");
      return {
        removed,
        changesRemaining: Math.max(
          0,
          BRIEFING_WATCHLIST_MONTHLY_CHANGE_LIMIT -
            changeCount -
            (removed ? 1 : 0),
        ),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError(
        "BRIEFING_WATCHLIST_REMOVE_FAILED",
        { cause: error },
      );
    } finally {
      client.release();
    }
  }

  async listBriefingAudience(): Promise<readonly BriefingAudience[]> {
    try {
      const result = await this.pool.query<{
        principal_id: string;
        preferred_locale: string | null;
        symbol: string;
        provider_code: string;
        company: string;
        exchange: string;
        position: number;
        created_at: string;
      }>(
        `SELECT w.principal_id, u.preferred_locale, w.symbol, w.provider_code,
                w.company, w.exchange, w.position, w.created_at
         FROM briefing_watchlist_items w
         JOIN app_users u ON u.principal_id = w.principal_id
         JOIN entitlements e ON e.principal_id = w.principal_id
         WHERE w.active = true
           AND e.plan_code IN ('pro', 'ultra')
           AND e.status IN ('active', 'trialing')
         ORDER BY w.symbol, w.principal_id`,
      );
      return Object.freeze(
        result.rows.map((row): BriefingAudience => {
          const locale: Locale = row.preferred_locale === "ko" ? "ko" : "en";
          return {
            principalId: row.principal_id,
            locale,
            item: briefingWatchlistItem(row),
          };
        }),
      );
    } catch (error) {
      throw new AccountStoreUnavailableError("BRIEFING_AUDIENCE_READ_FAILED", {
        cause: error,
      });
    }
  }

  async listBriefingEditionKeys(
    marketDate: string,
  ): Promise<ReadonlySet<string>> {
    try {
      const result = await this.pool.query<{ symbol: string; locale: string }>(
        `SELECT symbol, locale
         FROM briefing_editions
         WHERE market_date = $1::date`,
        [marketDate],
      );
      return new Set(result.rows.map((row) => `${row.symbol}:${row.locale}`));
    } catch (error) {
      throw new AccountStoreUnavailableError(
        "BRIEFING_EDITION_KEYS_READ_FAILED",
        { cause: error },
      );
    }
  }

  async saveBriefingSourceSnapshot(
    snapshot: BriefingSourceSnapshot,
  ): Promise<string> {
    try {
      const payload = JSON.stringify(snapshot);
      const snapshotId = randomUUID();
      await this.pool.query(
        `INSERT INTO briefing_source_snapshots(
           snapshot_id, symbol, market_date, cutoff_at, coverage_start,
           content_hash, payload
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          snapshotId,
          snapshot.symbol,
          snapshot.marketDate,
          snapshot.cutoffAt,
          snapshot.coverageStart,
          createHash("sha256").update(payload).digest("hex"),
          payload,
        ],
      );
      return snapshotId;
    } catch (error) {
      throw new AccountStoreUnavailableError("BRIEFING_SNAPSHOT_SAVE_FAILED", {
        cause: error,
      });
    }
  }

  async findPreviousBriefingEdition(
    symbol: string,
    locale: Locale,
    beforeMarketDate: string,
  ): Promise<BriefingEditionPayload | undefined> {
    try {
      const result = await this.pool.query<{ payload: BriefingEditionPayload }>(
        `SELECT payload
         FROM briefing_editions
         WHERE symbol = $1 AND locale = $2 AND market_date <= $3::date
         ORDER BY generated_at DESC
         LIMIT 1`,
        [symbol, locale, beforeMarketDate],
      );
      return result.rows[0]?.payload;
    } catch (error) {
      throw new AccountStoreUnavailableError("BRIEFING_PREVIOUS_READ_FAILED", {
        cause: error,
      });
    }
  }

  async saveBriefingEdition(
    edition: SaveBriefingEdition,
    recipients: readonly string[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO briefing_editions(
           briefing_id, symbol, company, market_date, locale, scheduled_for,
           snapshot_id, status, payload, generated_at
         ) VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9::jsonb, $10)
        `,
        [
          edition.briefingId,
          edition.symbol,
          edition.company,
          edition.marketDate,
          edition.locale,
          edition.scheduledFor,
          edition.snapshotId,
          edition.payload.status,
          JSON.stringify(edition.payload),
          edition.payload.generatedAt,
        ],
      );
      if (recipients.length > 0)
        await client.query(
          `INSERT INTO briefing_deliveries(principal_id, briefing_id)
           SELECT recipient, $2::uuid
           FROM unnest($1::char(64)[]) AS recipient
           ON CONFLICT (principal_id, briefing_id) DO NOTHING`,
          [recipients, edition.briefingId],
        );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError("BRIEFING_EDITION_SAVE_FAILED", {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  async listBriefings(
    principalId: string,
    locale: Locale,
    limit: number,
  ): Promise<readonly BriefingListItem[]> {
    try {
      const result = await this.pool.query<{
        briefing_id: string;
        symbol: string;
        company: string;
        market_date: string;
        generated_at: string;
        payload: BriefingEditionPayload;
        read_at: string | null;
      }>(
        `SELECT e.briefing_id, e.symbol, e.company, e.market_date,
                e.generated_at, e.payload, d.read_at
         FROM briefing_deliveries d
         JOIN briefing_editions e ON e.briefing_id = d.briefing_id
         JOIN briefing_watchlist_items w
           ON w.principal_id = d.principal_id
          AND w.symbol = e.symbol
          AND w.active = true
          AND e.generated_at >= w.created_at
         WHERE d.principal_id = $1 AND e.locale = $2
         ORDER BY e.market_date DESC, e.generated_at DESC
         LIMIT $3`,
        [principalId, locale, Math.max(1, Math.min(90, limit))],
      );
      return Object.freeze(
        result.rows.map((row) => {
          const nextEarnings = nextEarningsFor(row.payload);
          return {
            briefingId: row.briefing_id,
            symbol: row.symbol,
            company: row.company,
            locale,
            marketDate: new Date(row.market_date).toISOString().slice(0, 10),
            generatedAt: new Date(row.generated_at).toISOString(),
            status: row.payload.status,
            attention: row.payload.attention,
            headline: row.payload.headline,
            summary: row.payload.summary,
            price: row.payload.price,
            ...(nextEarnings === undefined ? {} : { nextEarnings }),
            unread: row.read_at === null,
          };
        }),
      );
    } catch (error) {
      throw new AccountStoreUnavailableError("BRIEFING_LIST_FAILED", {
        cause: error,
      });
    }
  }

  async briefingDetail(
    principalId: string,
    briefingId: string,
  ): Promise<BriefingEditionPayload | undefined> {
    try {
      const result = await this.pool.query<{ payload: BriefingEditionPayload }>(
        `SELECT e.payload
         FROM briefing_deliveries d
         JOIN briefing_editions e ON e.briefing_id = d.briefing_id
         JOIN briefing_watchlist_items w
           ON w.principal_id = d.principal_id
          AND w.symbol = e.symbol
          AND w.active = true
          AND e.generated_at >= w.created_at
         WHERE d.principal_id = $1 AND d.briefing_id = $2`,
        [principalId, briefingId],
      );
      return result.rows[0]?.payload;
    } catch (error) {
      throw new AccountStoreUnavailableError("BRIEFING_DETAIL_FAILED", {
        cause: error,
      });
    }
  }

  async markBriefingRead(
    principalId: string,
    briefingId: string,
  ): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `UPDATE briefing_deliveries
         SET read_at = COALESCE(read_at, now())
         WHERE principal_id = $1 AND briefing_id = $2`,
        [principalId, briefingId],
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      throw new AccountStoreUnavailableError("BRIEFING_READ_UPDATE_FAILED", {
        cause: error,
      });
    }
  }

  async handleWhopWebhook(
    event: import("../../lib/whop/server").WhopWebhookEvent,
  ): Promise<void> {
    const supportedEvents = new Set([
      "membership.activated",
      "membership.deactivated",
      "membership.cancel_at_period_end_changed",
      "payment.succeeded",
      "payment.failed",
      "payment.pending",
    ]);
    const eventType = event.type;
    const occurredAt = isoTimestamp(event.timestamp, new Date());
    const data = asRecord(event.data);
    const membership = eventType.startsWith("membership.")
      ? data
      : asRecord(data["membership"]);
    const plan = asRecord(membership["plan"] ?? data["plan"]);
    const user = asRecord(membership["user"] ?? data["user"]);
    const metadata = asRecord(membership["metadata"] ?? data["metadata"]);
    const membershipId =
      stringValue(membership["id"]) ??
      stringValue(data["membership_id"]) ??
      stringValue(data["membershipId"]);
    const whopUserId = stringValue(user["id"]) ?? stringValue(data["user_id"]);
    const email = stringValue(user["email"]) ?? stringValue(data["email"]);
    const planId = stringValue(plan["id"]) ?? stringValue(data["plan_id"]);
    const amount =
      typeof plan["renewal_price"] === "number"
        ? plan["renewal_price"]
        : typeof plan["initial_price"] === "number"
          ? plan["initial_price"]
          : undefined;
    const billingPeriod =
      typeof plan["billing_period"] === "number"
        ? plan["billing_period"]
        : undefined;
    const planKey =
      billingPlanKey(stringValue(metadata["stocksembly_plan_key"])) ??
      billingPlanKeyForWhopPlanId(planId) ??
      billingPlanKeyForPrice(amount, billingPeriod);
    const metadataPrincipalId = validPrincipalId(
      stringValue(metadata["stocksembly_principal_id"]),
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const eventId = event.id ?? `${eventType}:${membershipId ?? occurredAt}`;
      const inserted = await client.query<{ event_id: string }>(
        `INSERT INTO whop_webhook_events(
          event_id, event_type, occurred_at, payload
        ) VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id`,
        [eventId, eventType, occurredAt, JSON.stringify(event)],
      );
      if (inserted.rows.length === 0) {
        await client.query("COMMIT");
        return;
      }
      if (!supportedEvents.has(eventType)) {
        await client.query("COMMIT");
        return;
      }

      let principalId = metadataPrincipalId;
      if (principalId === undefined) {
        const principalResult = await client.query<{ principal_id: string }>(
          `SELECT principal_id
           FROM app_users
           WHERE ($1::text IS NOT NULL AND whop_user_id = $1)
              OR ($2::text IS NOT NULL AND lower(email) = lower($2))
           LIMIT 1`,
          [whopUserId ?? null, email ?? null],
        );
        principalId = principalResult.rows[0]?.principal_id;
      }
      if (principalId === undefined) {
        await client.query("COMMIT");
        return;
      }
      if (whopUserId !== undefined) {
        await client.query(
          `UPDATE app_users
           SET whop_user_id = $2, updated_at = now()
           WHERE principal_id = $1`,
          [principalId, whopUserId],
        );
      }

      const existingResult = await client.query<{
        plan_code: string;
        status: string;
        whop_event_at: string | null;
        current_period_start: string | null;
        current_period_end: string | null;
        manage_url: string | null;
        cancel_at_period_end: boolean;
      }>(
        `SELECT plan_code, status, whop_event_at, current_period_start,
                current_period_end, manage_url, cancel_at_period_end
         FROM entitlements
         WHERE principal_id = $1
         FOR UPDATE`,
        [principalId],
      );
      const existing = existingResult.rows[0];
      const previousEventAt =
        existing?.whop_event_at === null ||
        existing?.whop_event_at === undefined
          ? undefined
          : Date.parse(existing.whop_event_at);
      if (
        previousEventAt !== undefined &&
        previousEventAt > Date.parse(occurredAt)
      ) {
        await client.query("COMMIT");
        return;
      }

      if (eventType === "membership.cancel_at_period_end_changed") {
        if (existing !== undefined) {
          await client.query(
            `UPDATE entitlements
             SET cancel_at_period_end = $2,
                 manage_url = COALESCE($3, manage_url),
                 whop_event_at = $4,
                 updated_at = now()
             WHERE principal_id = $1`,
            [
              principalId,
              booleanValue(membership["cancel_at_period_end"]) ??
                booleanValue(data["cancel_at_period_end"]) ??
                existing.cancel_at_period_end,
              stringValue(membership["manage_url"]) ??
                stringValue(data["manage_url"]) ??
                existing.manage_url,
              occurredAt,
            ],
          );
        }
        await client.query("COMMIT");
        return;
      }

      const resolvedTier = planKey
        ? billingTierForPlanKey(planKey)
        : tierForPlanCode(existing?.plan_code);
      if (resolvedTier === "free" && eventType !== "membership.deactivated") {
        await client.query("COMMIT");
        return;
      }
      const planCode = resolvedTier === "free" ? "preview" : resolvedTier;
      const status =
        eventType === "membership.deactivated"
          ? "cancelled"
          : eventType === "payment.failed"
            ? "past_due"
            : eventType === "payment.pending"
              ? (existing?.status ?? "past_due")
              : membership["status"] === "trialing"
                ? "trialing"
                : "active";
      const periodStart =
        stringValue(membership["renewal_period_start"]) ??
        existing?.current_period_start ??
        occurredAt;
      const periodEnd =
        stringValue(membership["renewal_period_end"]) ??
        existing?.current_period_end ??
        null;
      const manageUrl =
        stringValue(membership["manage_url"]) ??
        stringValue(data["manage_url"]) ??
        existing?.manage_url ??
        null;
      const cancelAtPeriodEnd =
        booleanValue(membership["cancel_at_period_end"]) ??
        booleanValue(data["cancel_at_period_end"]) ??
        existing?.cancel_at_period_end ??
        false;
      const monthlyCreditLimit =
        resolvedTier === "free" ? 0 : MONTHLY_CREDIT_ALLOWANCE[resolvedTier];
      await client.query(
        `INSERT INTO entitlements(
          principal_id, plan_code, status, current_period_start,
          current_period_end, created_at, updated_at, whop_membership_id,
          whop_plan_id, manage_url, cancel_at_period_end, whop_event_at,
          monthly_credit_limit
        ) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $6, $11)
        ON CONFLICT (principal_id) DO UPDATE SET
          plan_code = EXCLUDED.plan_code,
          status = EXCLUDED.status,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          updated_at = EXCLUDED.updated_at,
          whop_membership_id = COALESCE(EXCLUDED.whop_membership_id, entitlements.whop_membership_id),
          whop_plan_id = COALESCE(EXCLUDED.whop_plan_id, entitlements.whop_plan_id),
          manage_url = COALESCE(EXCLUDED.manage_url, entitlements.manage_url),
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          whop_event_at = EXCLUDED.whop_event_at,
          monthly_credit_limit = EXCLUDED.monthly_credit_limit
        WHERE entitlements.whop_event_at IS NULL
           OR entitlements.whop_event_at <= EXCLUDED.whop_event_at`,
        [
          principalId,
          planCode,
          status,
          periodStart,
          periodEnd,
          occurredAt,
          membershipId,
          planId,
          manageUrl,
          cancelAtPeriodEnd,
          monthlyCreditLimit,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new AccountStoreUnavailableError("ACCOUNT_WHOP_WEBHOOK_FAILED", {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  async preferredLocale(principalId: string): Promise<Locale | undefined> {
    try {
      const result = await this.pool.query<{ preferred_locale: string | null }>(
        `SELECT preferred_locale
         FROM app_users
         WHERE principal_id = $1`,
        [principalId],
      );
      const locale = result.rows[0]?.preferred_locale;
      return locale === "en" || locale === "ko" ? locale : undefined;
    } catch (error) {
      throw new AccountStoreUnavailableError(
        "ACCOUNT_LOCALE_PREFERENCE_READ_FAILED",
        { cause: error },
      );
    }
  }

  async updatePreferredLocale(
    principalId: string,
    locale: Locale,
  ): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE app_users
         SET preferred_locale = $2, updated_at = now()
         WHERE principal_id = $1`,
        [principalId, locale],
      );
    } catch (error) {
      throw new AccountStoreUnavailableError(
        "ACCOUNT_LOCALE_PREFERENCE_UPDATE_FAILED",
        { cause: error },
      );
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function createLiveAccountStore(): Promise<
  PostgresAccountStore | undefined
> {
  const configuration = await poolConfiguration();
  return configuration === undefined
    ? undefined
    : await PostgresAccountStore.create(configuration);
}

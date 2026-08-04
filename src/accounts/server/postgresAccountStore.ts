import { readFile } from "node:fs/promises";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { z } from "zod";
import type { Locale } from "../../lib/i18n";
import type {
  BillingCreditActivity,
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

function dailyPeriodBounds(now: Date): {
  readonly start: Date;
  readonly end: Date;
  readonly key: string;
} {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
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
  }>(
    `SELECT plan_code, status, monthly_credit_limit
     FROM entitlements
     WHERE principal_id = $1
     LIMIT 1`,
    [principalId],
  );
  const entitlement = result.rows[0];
  const rawStatus = billingStatus(entitlement?.status);
  const rawTier = tierForPlanCode(entitlement?.plan_code);
  const paidStatus = ["active", "trialing", "past_due"].includes(rawStatus);
  const tier = paidStatus ? rawTier : "free";
  const isFree = tier === "free";
  const bounds = isFree ? dailyPeriodBounds(now) : periodBounds(now);
  const configuredAllowance = Number(entitlement?.monthly_credit_limit ?? 0);
  const allowance = isFree
    ? FREE_DAILY_CREDIT_ALLOWANCE
    : configuredAllowance > 0
      ? configuredAllowance
      : MONTHLY_CREDIT_ALLOWANCE[tier];
  return { tier, status: rawStatus, allowance, isFree, bounds };
}

async function ensureCreditGrant(
  client: PoolClient,
  principalId: string,
  context: CreditPeriodContext,
  now: Date,
): Promise<void> {
  if (context.allowance <= 0) return;
  await client.query(
    `INSERT INTO credit_grants(
      grant_key, principal_id, period_key, plan_code, credits,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $6)
    ON CONFLICT (principal_id, period_key) DO UPDATE SET
      credits = GREATEST(credit_grants.credits, EXCLUDED.credits),
      plan_code = EXCLUDED.plan_code,
      updated_at = EXCLUDED.updated_at`,
    [
      `credit:${principalId}:${context.bounds.key}`,
      principalId,
      context.bounds.key,
      context.isFree ? "free" : context.tier,
      context.allowance,
      now.toISOString(),
    ],
  );
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
      await client.query(
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
          last_seen_at = GREATEST(app_users.last_seen_at, EXCLUDED.last_seen_at)`,
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
      const result = availability(
        Math.max(0, context.allowance - used),
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
      const result = availability(
        Math.max(0, context.allowance - used),
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
      const remaining = Math.max(0, context.allowance - used);
      const required = CREDIT_COSTS.researchRoomView;
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
        required,
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
    const monthlyBounds = periodBounds(now);
    const dailyBounds = dailyPeriodBounds(now);
    try {
      const entitlementResult = await this.pool.query<{
        plan_code: string;
        status: string;
        monthly_credit_limit: number | null;
        manage_url: string | null;
      }>(
        `SELECT plan_code, status, monthly_credit_limit, manage_url
         FROM entitlements
         WHERE principal_id = $1
         LIMIT 1`,
        [principalId],
      );
      const entitlement = entitlementResult.rows[0];
      const rawStatus = billingStatus(entitlement?.status);
      const rawTier = tierForPlanCode(entitlement?.plan_code);
      const paidStatus = ["active", "trialing", "past_due"].includes(rawStatus);
      const tier = paidStatus ? rawTier : "free";
      const isFree = tier === "free";
      const bounds = isFree ? dailyBounds : monthlyBounds;
      const configuredAllowance = Number(
        entitlement?.monthly_credit_limit ?? 0,
      );
      const allowance = isFree
        ? FREE_DAILY_CREDIT_ALLOWANCE
        : configuredAllowance > 0
          ? configuredAllowance
          : MONTHLY_CREDIT_ALLOWANCE[tier];
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        if (allowance > 0) {
          await client.query(
            `INSERT INTO credit_grants(
              grant_key, principal_id, period_key, plan_code, credits,
              created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $6)
            ON CONFLICT (principal_id, period_key) DO UPDATE SET
              credits = GREATEST(credit_grants.credits, EXCLUDED.credits),
              plan_code = EXCLUDED.plan_code,
              updated_at = EXCLUDED.updated_at`,
            [
              `credit:${principalId}:${bounds.key}`,
              principalId,
              bounds.key,
              isFree ? "free" : tier,
              allowance,
              now.toISOString(),
            ],
          );
        }
        const usage = await client.query<{ used: number }>(
          `SELECT COALESCE(SUM(quantity), 0)::int AS used
           FROM usage_events
           WHERE principal_id = $1
             AND occurred_at >= $2::timestamptz
             AND occurred_at < $3::timestamptz`,
          [principalId, bounds.start.toISOString(), bounds.end.toISOString()],
        );
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
        await client.query("COMMIT");
        const used = Math.max(0, Number(usage.rows[0]?.used ?? 0));
        return {
          tier,
          status: rawStatus,
          credits: {
            remaining: Math.max(0, allowance - used),
            allowance,
            used,
            usedPercent:
              allowance === 0
                ? 0
                : Math.min(100, Math.round((used / allowance) * 1000) / 10),
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
          ...(entitlement?.manage_url === null ||
          entitlement?.manage_url === undefined
            ? {}
            : { manageUrl: entitlement.manage_url }),
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
    return status.tier === "free" ||
      !["active", "trialing"].includes(status.status)
      ? "free"
      : "paid";
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

import { readFile } from "node:fs/promises";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { Pool, type PoolConfig } from "pg";
import { z } from "zod";
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
  type AccountStore,
  AccountStoreUnavailableError,
} from "./accountStore";
import { applyPostgresAccountMigrations } from "./postgresAccountMigrations";

const SecretSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().positive().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  dbname: z.string().min(1).optional(),
});

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
      await client.query(
        `INSERT INTO usage_events(
          event_key, principal_id, kind, run_id, quantity, occurred_at, metadata
        ) VALUES ($1, $2, 'research_run_created', $3, 1, $4, $5::jsonb)
        ON CONFLICT (event_key) DO NOTHING`,
        [
          `research-run:${run.runId}`,
          principalId,
          run.runId,
          run.createdAt,
          JSON.stringify({ symbol: run.symbol, locale: run.locale }),
        ],
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
    try {
      await this.pool.query(
        `INSERT INTO report_consultations(
          question_id, report_id, principal_id, public_question,
          created_at, recorded_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5, now())
        ON CONFLICT (question_id) DO UPDATE SET
          public_question = EXCLUDED.public_question,
          recorded_at = now()
        WHERE report_consultations.principal_id = EXCLUDED.principal_id`,
        [
          question.questionId,
          question.reportId,
          principalId,
          JSON.stringify(question),
          question.createdAt,
        ],
      );
    } catch (error) {
      throw new AccountStoreUnavailableError(
        "ACCOUNT_CONSULTATION_RECORD_FAILED",
        { cause: error },
      );
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

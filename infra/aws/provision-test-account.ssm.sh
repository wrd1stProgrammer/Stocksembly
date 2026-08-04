#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <base64-identity-payload>" >&2
  exit 64
fi

identity="$(printf '%s' "$1" | base64 --decode)"
subject="${identity%%$'\n'*}"
email="${identity#*$'\n'}"
if [[ -z "$subject" || -z "$email" || "$subject" == "$identity" ]]; then
  echo "invalid identity payload" >&2
  exit 65
fi

container="stocksembly-web"
if ! docker inspect "$container" >/dev/null 2>&1; then
  echo "web container is unavailable" >&2
  exit 66
fi

if ! command -v aws >/dev/null 2>&1; then
  dnf install -y awscli-2 || dnf install -y awscli
fi

container_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container")"
secret_arn="$(printf '%s\n' "$container_env" | sed -n 's/^STOCKSEMBLY_DB_SECRET_ARN=//p')"
db_host="$(printf '%s\n' "$container_env" | sed -n 's/^STOCKSEMBLY_DB_HOST=//p')"
db_port="$(printf '%s\n' "$container_env" | sed -n 's/^STOCKSEMBLY_DB_PORT=//p')"
db_name="$(printf '%s\n' "$container_env" | sed -n 's/^STOCKSEMBLY_DB_NAME=//p')"
if [[ -z "$secret_arn" || -z "$db_host" ]]; then
  echo "database runtime configuration is unavailable" >&2
  exit 67
fi

secret_json="$(aws secretsmanager get-secret-value \
  --secret-id "$secret_arn" \
  --query SecretString \
  --output text)"
db_user="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["username"])' <<<"$secret_json")"
db_password="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["password"])' <<<"$secret_json")"

docker exec \
  --env "PGHOST=$db_host" \
  --env "PGPORT=${db_port:-5432}" \
  --env "PGDATABASE=${db_name:-stocksembly}" \
  --env "PGUSER=$db_user" \
  --env "PGPASSWORD=$db_password" \
  --env "STOCKSEMBLY_TEST_SUBJECT=$subject" \
  --env "STOCKSEMBLY_TEST_EMAIL=$email" \
  "$container" \
  node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { readFileSync } from "node:fs";
    import pg from "pg";

    const { Pool } = pg;
    const subject = process.env.STOCKSEMBLY_TEST_SUBJECT;
    const email = process.env.STOCKSEMBLY_TEST_EMAIL;
    if (!subject || !email) throw new Error("TEST_IDENTITY_REQUIRED");
    const principalId = createHash("sha256")
      .update(`stocksembly-cognito-principal-v1:${subject}`)
      .digest("hex");
    const now = new Date();
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const periodKey = periodStart.toISOString().slice(0, 10);
    const pool = new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? "stocksembly",
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: {
        ca: readFileSync(
          "/etc/ssl/certs/aws-rds-global-bundle.pem",
          "utf8",
        ),
        rejectUnauthorized: true,
      },
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO app_users(
          principal_id, cognito_subject, username, email, display_name,
          created_at, updated_at, last_seen_at
        ) VALUES ($1, $2, $3, $3, $3, $4, $4, $4)
        ON CONFLICT (principal_id) DO UPDATE SET
          cognito_subject = EXCLUDED.cognito_subject,
          username = EXCLUDED.username,
          email = EXCLUDED.email,
          last_seen_at = EXCLUDED.last_seen_at,
          updated_at = EXCLUDED.updated_at`,
        [principalId, subject, email, now.toISOString()],
      );
      await client.query(
        `INSERT INTO entitlements(
          principal_id, plan_code, status, current_period_start,
          current_period_end, created_at, updated_at, monthly_credit_limit
        ) VALUES ($1, $$pro$$, $$active$$, $2, $3, $4, $4, 100)
        ON CONFLICT (principal_id) DO UPDATE SET
          plan_code = $$pro$$,
          status = $$active$$,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          monthly_credit_limit = 100,
          updated_at = EXCLUDED.updated_at`,
        [principalId, periodStart.toISOString(), periodEnd.toISOString(), now.toISOString()],
      );
      await client.query(
        `INSERT INTO credit_grants(
          grant_key, principal_id, period_key, plan_code, credits,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $$pro$$, 100, $4, $4)
        ON CONFLICT (principal_id, period_key) DO UPDATE SET
          credits = GREATEST(credit_grants.credits, 100),
          plan_code = $$pro$$,
          updated_at = EXCLUDED.updated_at`,
        [
          `credit:${principalId}:${periodKey}`,
          principalId,
          periodKey,
          now.toISOString(),
        ],
      );
      await client.query("COMMIT");
      process.stdout.write(
        JSON.stringify({ email, principalId, allowance: 100 }) + "\n",
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  '

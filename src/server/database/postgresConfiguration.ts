import { readFile } from "node:fs/promises";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { PoolConfig } from "pg";
import { z } from "zod";
import { rotatingDatabasePassword } from "../../accounts/server/rotatingDatabasePassword";

const SecretSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().positive().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  dbname: z.string().min(1).optional(),
});

export async function postgresPoolConfiguration(): Promise<
  PoolConfig | undefined
> {
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
  const loadSecret = async () => {
    const secrets = new SecretsManagerClient({ region });
    try {
      const response = await secrets.send(
        new GetSecretValueCommand({ SecretId: secretArn }),
      );
      if (!response.SecretString) throw new Error("DATABASE_SECRET_EMPTY");
      return SecretSchema.parse(JSON.parse(response.SecretString));
    } finally {
      secrets.destroy();
    }
  };
  const secret = await loadSecret();
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
    password: rotatingDatabasePassword(
      secret.password,
      async () => (await loadSecret()).password,
    ),
    database:
      process.env["STOCKSEMBLY_DB_NAME"] ?? secret.dbname ?? "stocksembly",
    ssl: { ca: certificateAuthority, rejectUnauthorized: true },
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  };
}

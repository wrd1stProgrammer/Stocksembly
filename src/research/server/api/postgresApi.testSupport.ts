import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const connectionString =
  process.env["STOCKSEMBLY_API_TEST_DATABASE_URL"] ??
  "postgresql://127.0.0.1:55432/stocksembly_api_test";
const schemas: { schema: string; pool: Pool }[] = [];
let current: Pool | undefined;

export async function createApiTestDatabase(): Promise<Pool> {
  const schema = `api_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
  } finally {
    await admin.end();
  }
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema},pg_catalog`,
  });
  schemas.push({ schema, pool });
  current = pool;
  return pool;
}

export function currentApiTestDatabase(): Pool {
  if (!current) throw new Error("API_TEST_DATABASE_NOT_CREATED");
  return current;
}

export async function cleanupApiTestDatabases(): Promise<void> {
  const admin = new Pool({ connectionString });
  try {
    for (const { schema, pool } of schemas.splice(0)) {
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    }
    current = undefined;
  } finally {
    await admin.end();
  }
}

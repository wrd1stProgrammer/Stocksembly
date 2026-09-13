import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrateResearchDatabase } from "../research/server/persistence/postgres/migrations";

/** Each fixture owns a complete disposable PostgreSQL database. */
export async function createResearchTestDatabase(): Promise<{
  readonly pool: Pool;
  readonly close: () => Promise<void>;
}> {
  const url = new URL(
    process.env["STOCKSEMBLY_TEST_DATABASE_URL"] ??
      "postgresql://127.0.0.1:55432/stocksembly_migration_test",
  );
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test") ||
    url.search !== ""
  ) {
    throw new Error(
      "Research fixtures require a loopback *_test database URL without query overrides",
    );
  }
  const databaseName = `stocksembly_fixture_${randomUUID().replaceAll("-", "")}_test`;
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  url.pathname = `/${databaseName}`;
  const pool = new Pool({
    connectionString: url.toString(),
    max: 4,
    options: "-c search_path=research,pg_catalog",
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await pool.end();
      for (let attempt = 0; ; attempt++) {
        try {
          await admin.query(`DROP DATABASE "${databaseName}"`);
          break;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("code" in error) ||
            error.code !== "55006" ||
            attempt >= 20
          )
            throw error;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    } finally {
      await admin.end();
    }
  };
  try {
    await migrateResearchDatabase(pool);
    return { pool, close };
  } catch (error) {
    await close();
    throw error;
  }
}

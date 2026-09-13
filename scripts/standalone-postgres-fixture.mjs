import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export async function createStandaloneTestDatabase() {
  const url = new URL(
    process.env.STOCKSEMBLY_TEST_DATABASE_URL ??
      "postgresql://127.0.0.1:55432/stocksembly_migration_test",
  );
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname.endsWith("_test") ||
    url.search
  ) {
    throw new Error(
      "Standalone verification requires a loopback *_test PostgreSQL URL without query overrides",
    );
  }
  const name = `stocksembly_standalone_${randomUUID().replaceAll("-", "")}_test`;
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    close: async () => {
      try {
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    },
  };
}

import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { applyResearchMigrations } from "../../../../server/database/postgresMigrations";

async function migrationsDirectory(): Promise<string> {
  const configured = process.env["STOCKSEMBLY_MIGRATIONS_DIR"];
  if (configured) return configured;
  const packaged = join(process.cwd(), "migrations");
  try {
    await access(join(packaged, "001_research_baseline.sql"));
    return packaged;
  } catch {
    return join(
      process.cwd(),
      "src/research/server/persistence/postgres/migrations",
    );
  }
}

export async function migrateResearchDatabase(
  pool: Pool,
  directory?: string,
): Promise<void> {
  const resolved = directory ?? (await migrationsDirectory());
  const entries = await readdir(resolved).catch(() => {
    throw Object.assign(new Error("MIGRATIONS_UNAVAILABLE"), {
      code: "MIGRATIONS_UNAVAILABLE",
    });
  });
  const names = entries.filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
  if (names.length === 0)
    throw Object.assign(new Error("MIGRATIONS_UNAVAILABLE"), {
      code: "MIGRATIONS_UNAVAILABLE",
    });
  const migrations = await Promise.all(
    names.map(async (name) => ({
      version: Number(name.slice(0, 3)),
      name,
      sql: await readFile(join(resolved, name), "utf8").catch(() => {
        throw Object.assign(new Error("MIGRATIONS_UNAVAILABLE"), {
          code: "MIGRATIONS_UNAVAILABLE",
        });
      }),
    })),
  );
  await applyResearchMigrations(pool, migrations);
}

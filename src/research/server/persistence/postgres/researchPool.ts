import type { Pool } from "pg";
import { postgresPoolConfiguration } from "../../../../server/database/postgresConfiguration";
import { RotationAwarePool } from "../../../../server/database/rotationAwarePool";
import { migrateResearchDatabase } from "./migrations";

let poolPromise: Promise<Pool> | undefined;
/** One shared, migrated research pool per process; never falls back to local storage. */
export async function getResearchPool(): Promise<Pool> {
  if (
    process.env["NODE_ENV"] === "production" &&
    process.env["STOCKSEMBLY_RESEARCH_POSTGRES_READY"] !== "true"
  )
    throw new Error("RESEARCH_POSTGRES_CUTOVER_NOT_READY");
  poolPromise ??= openResearchPool().catch((error: unknown) => {
    poolPromise = undefined;
    throw error;
  });
  return poolPromise;
}
async function openResearchPool(): Promise<Pool> {
  const configuration = await postgresPoolConfiguration();
  if (!configuration)
    throw new Error("STOCKSEMBLY_DATABASE_CONFIGURATION_REQUIRED");
  const pool = new RotationAwarePool({
    ...configuration,
    options: [configuration.options, "-c search_path=research,pg_catalog"]
      .filter(Boolean)
      .join(" "),
  });
  // An idle connection can fail independently of a query during an RDS restart.
  pool.on("error", () => {
    console.warn("RESEARCH_DATABASE_IDLE_CONNECTION_FAILED");
  });
  try {
    await migrateResearchDatabase(pool);
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
export async function closeResearchPool(): Promise<void> {
  const current = poolPromise;
  poolPromise = undefined;
  if (current) await (await current).end();
}

import { Pool } from "pg";
import { postgresPoolConfiguration } from "../../server/database/postgresConfiguration";

/** Audit commands must not run migrations or mutate the database they inspect. */
export async function withResearchAuditDatabase<T>(
  audit: (database: Pool) => Promise<T>,
): Promise<T> {
  const configuration = await postgresPoolConfiguration();
  if (!configuration)
    throw new Error("STOCKSEMBLY_DATABASE_CONFIGURATION_REQUIRED");
  const database = new Pool({
    ...configuration,
    max: 1,
    options: [
      configuration.options,
      "-c search_path=research,pg_catalog -c default_transaction_read_only=on",
    ]
      .filter(Boolean)
      .join(" "),
  });
  try {
    return await audit(database);
  } finally {
    await database.end();
  }
}

import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { postgresTransaction } from "../../../../server/database/postgresTransaction";
export type ResearchDatabase = Pool | PoolClient;
/** Nested repositories keep their transaction on the caller's checked-out client. */
export async function researchTransaction<T>(
  database: ResearchDatabase,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (database instanceof Pool) return postgresTransaction(database, operation);
  const savepoint = `research_${randomUUID().replaceAll("-", "")}`;
  await database.query(`SAVEPOINT ${savepoint}`);
  try {
    const result = await operation(database);
    await database.query(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    await database.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await database.query(`RELEASE SAVEPOINT ${savepoint}`);
    throw error;
  }
}
export const withResearchTransaction = researchTransaction;

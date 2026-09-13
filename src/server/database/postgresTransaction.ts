import type { Pool, PoolClient } from "pg";

/** The callback must use this client for every statement in the transaction. */
export async function postgresTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    // Never retry the callback here: it may have performed an external action,
    // and a lost COMMIT response does not establish that the commit failed.
    throw error;
  } finally {
    client.release(discard);
  }
}

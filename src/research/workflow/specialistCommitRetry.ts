import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { withResearchTransaction } from "../server/persistence/postgres/database";
import { serializeSafeJson } from "../server/persistence/postgres/safeJson";

export async function retryRejectedCommit<
  Result extends { readonly kind: string },
>(commit: () => Promise<Result>): Promise<Result> {
  const first = await commit();
  return first.kind === "rejected" ? await commit() : first;
}

export async function reserveEditorialQualityRewrite(
  input: Readonly<{
    database: ResearchDatabase;
    runId: string;
    inputHash: string;
    now: string;
  }>,
): Promise<boolean> {
  const database = input.database;
  return await withResearchTransaction(database, async (transaction) => {
    await transaction.query(
      "SELECT run_id FROM runs WHERE run_id = $1 FOR UPDATE",
      [input.runId],
    );
    const exists = (
      await transaction.query(
        `SELECT request_hash FROM idempotency_records
          WHERE scope = 'editorial-quality-rewrite' AND idempotency_key = $1`,
        [input.runId],
      )
    ).rows[0] as { readonly request_hash: string } | undefined;
    if (exists !== undefined) return exists.request_hash === input.inputHash;
    const budget = await transaction.query(
      `UPDATE runs SET requested_replacement_calls = requested_replacement_calls - 1
          WHERE run_id = $1 AND requested_replacement_calls > 0`,
      [input.runId],
    );
    if (budget.rowCount !== 1) return false;
    await transaction.query(
      `INSERT INTO idempotency_records(scope, idempotency_key,
          request_hash, result_json, created_at) VALUES (
          'editorial-quality-rewrite', $1, $2, $3, $4)`,
      [
        input.runId,
        input.inputHash,
        serializeSafeJson({ attempt: 1, status: "reserved" }),
        input.now,
      ],
    );
    return true;
  });
}

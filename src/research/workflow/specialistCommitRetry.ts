import Database from "better-sqlite3";
import { serializeSafeJson } from "../server/persistence/sqlite/safeJson";

export async function retryRejectedCommit<
  Result extends { readonly kind: string },
>(commit: () => Promise<Result>): Promise<Result> {
  const first = await commit();
  return first.kind === "rejected" ? await commit() : first;
}

export function reserveEditorialQualityRewrite(input: Readonly<{
  databasePath: string;
  runId: string;
  inputHash: string;
  now: string;
}>): boolean {
  const database = new Database(input.databasePath, { timeout: 5_000 });
  try {
    return database.transaction(() => {
      const exists = database
        .prepare(`SELECT request_hash FROM idempotency_records
          WHERE scope = 'editorial-quality-rewrite' AND idempotency_key = ?`)
        .get(input.runId) as { readonly request_hash: string } | undefined;
      if (exists !== undefined) return exists.request_hash === input.inputHash;
      const budget = database
        .prepare(`UPDATE runs SET requested_replacement_calls = requested_replacement_calls - 1
          WHERE run_id = ? AND requested_replacement_calls > 0`)
        .run(input.runId);
      if (budget.changes !== 1) return false;
      database
        .prepare(`INSERT INTO idempotency_records(scope, idempotency_key,
          request_hash, result_json, created_at) VALUES (
          'editorial-quality-rewrite', ?, ?, ?, ?)`)
        .run(
          input.runId,
          input.inputHash,
          serializeSafeJson({ attempt: 1, status: "reserved" }),
          input.now,
        );
      return true;
    }).immediate();
  } finally {
    database.close();
  }
}

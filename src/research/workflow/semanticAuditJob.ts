import type Database from "better-sqlite3";
import { z } from "zod";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";
import {
  type PersistedSemanticAuditJob,
  PersistedSemanticAuditJobSchema,
} from "./semanticAuditContracts";

export function loadSemanticAuditJob(
  database: Database.Database,
  runId: string,
): PersistedSemanticAuditJob | undefined {
  const row = z
    .object({ result_json: z.string() })
    .safeParse(
      database
        .prepare(
          "SELECT result_json FROM idempotency_records WHERE scope = 'semantic-audit-job' AND idempotency_key = ?",
        )
        .get(runId),
    );
  return row.success
    ? PersistedSemanticAuditJobSchema.parse(parseSafeJson(row.data.result_json))
    : undefined;
}

import { z } from "zod";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { parseSafeJson } from "../server/persistence/postgres/safeJson";
import {
  type PersistedSemanticAuditJob,
  PersistedSemanticAuditJobSchema,
} from "./semanticAuditContracts";

export async function loadSemanticAuditJob(
  database: ResearchDatabase,
  runId: string,
): Promise<PersistedSemanticAuditJob | undefined> {
  const row = z
    .object({ result_json: z.string() })
    .safeParse(
      (
        await database.query(
          "SELECT result_json FROM idempotency_records WHERE scope = 'semantic-audit-job' AND idempotency_key = $1",
          [runId],
        )
      ).rows[0],
    );
  return row.success
    ? PersistedSemanticAuditJobSchema.parse(parseSafeJson(row.data.result_json))
    : undefined;
}

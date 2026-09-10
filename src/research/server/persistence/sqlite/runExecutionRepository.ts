import Database from "better-sqlite3";
import { z } from "zod";
import {
  RESEARCH_EXECUTION_LIMITS,
  type ResearchExecutionBackend,
  ResearchExecutionBackendSchema,
  type ResearchQueueStatus,
} from "../../../domain/researchExecution";

export const ACTIVE_RESEARCH_SQL = "status IN ('running', 'cancelling')";

export function researchExecutionCapacity() {
  const api =
    process.env["STOCKSEMBLY_CODEX_API_ENABLED"] === "1" &&
    process.env["STOCKSEMBLY_CODEX_API_AUTH_PATH"]?.trim()
      ? RESEARCH_EXECUTION_LIMITS.api
      : 0;
  return {
    subscription: RESEARCH_EXECUTION_LIMITS.subscription,
    api,
    total: RESEARCH_EXECUTION_LIMITS.subscription + api,
  };
}

const CountsSchema = z.object({ subscription: z.number(), api: z.number() });

export function activeExecutionCounts(database: Database.Database) {
  return CountsSchema.parse(
    database
      .prepare(`SELECT
    COALESCE(SUM(execution_backend = 'subscription'), 0) AS subscription,
    COALESCE(SUM(execution_backend = 'api'), 0) AS api
    FROM runs WHERE ${ACTIVE_RESEARCH_SQL}`)
      .get(),
  );
}

export function availableExecutionBackend(
  database: Database.Database,
): ResearchExecutionBackend | undefined {
  const counts = activeExecutionCounts(database);
  const capacity = researchExecutionCapacity();
  if (counts.subscription < capacity.subscription) return "subscription";
  if (counts.api < capacity.api) return "api";
  return undefined;
}

export function readRunExecutionBackend(
  databasePath: string,
  runId: string,
): ResearchExecutionBackend {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const row = z
      .object({ execution_backend: ResearchExecutionBackendSchema })
      .parse(
        database
          .prepare("SELECT execution_backend FROM runs WHERE run_id = ?")
          .get(runId),
      );
    return row.execution_backend;
  } finally {
    database.close();
  }
}

export function researchQueueStatus(
  database: Database.Database,
  runId: string,
): ResearchQueueStatus | undefined {
  const row = z.object({ position: z.number().int().positive() }).safeParse(
    database
      .prepare(`SELECT (SELECT COUNT(*) FROM runs ahead WHERE ahead.status = 'queued'
      AND (ahead.created_at < current.created_at OR
        (ahead.created_at = current.created_at AND ahead.run_id <= current.run_id))) AS position
      FROM runs current WHERE current.run_id = ? AND current.status = 'queued'`)
      .get(runId),
  );
  if (!row.success) return undefined;
  const active = activeExecutionCounts(database);
  return {
    position: row.data.position,
    activeRuns: active.subscription + active.api,
    capacity: researchExecutionCapacity().total,
  };
}

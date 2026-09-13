import { z } from "zod";
import {
  RESEARCH_EXECUTION_LIMITS,
  type ResearchExecutionBackend,
  ResearchExecutionBackendSchema,
  type ResearchQueueStatus,
} from "../../../domain/researchExecution";
import type { ResearchDatabase } from "./database";
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
export async function activeExecutionCounts(database: ResearchDatabase) {
  return CountsSchema.parse(
    (
      await database.query(
        `SELECT COUNT(*) FILTER (WHERE execution_backend = 'subscription')::integer AS subscription, COUNT(*) FILTER (WHERE execution_backend = 'api')::integer AS api FROM research.runs WHERE ${ACTIVE_RESEARCH_SQL}`,
      )
    ).rows[0],
  );
}
export async function availableExecutionBackend(
  database: ResearchDatabase,
): Promise<ResearchExecutionBackend | undefined> {
  const counts = await activeExecutionCounts(database);
  const capacity = researchExecutionCapacity();
  if (counts.subscription < capacity.subscription) return "subscription";
  if (counts.api < capacity.api) return "api";
  return undefined;
}
export async function readRunExecutionBackend(
  database: ResearchDatabase,
  runId: string,
): Promise<ResearchExecutionBackend> {
  {
    const row = z
      .object({ execution_backend: ResearchExecutionBackendSchema })
      .parse(
        (
          await database.query(
            `SELECT execution_backend FROM research.runs WHERE run_id = $1`,
            [runId],
          )
        ).rows[0],
      );
    return row.execution_backend;
  }
}
export async function researchQueueStatus(
  database: ResearchDatabase,
  runId: string,
): Promise<ResearchQueueStatus | undefined> {
  const row = z.object({ position: z.number().int().positive() }).safeParse(
    (
      await database.query(
        `SELECT (SELECT COUNT(*)::integer FROM research.runs ahead WHERE ahead.status = 'queued'
      AND (ahead.created_at < current.created_at OR
        (ahead.created_at = current.created_at AND ahead.run_id <= current.run_id))) AS position
      FROM research.runs current WHERE current.run_id = $1 AND current.status = 'queued'`,
        [runId],
      )
    ).rows[0],
  );
  if (!row.success) return undefined;
  const active = await activeExecutionCounts(database);
  return {
    position: row.data.position,
    activeRuns: active.subscription + active.api,
    capacity: researchExecutionCapacity().total,
  };
}

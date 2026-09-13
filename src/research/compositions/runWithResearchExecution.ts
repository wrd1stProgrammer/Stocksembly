import { codexExecutionContext } from "../server/codex/codexExecutionContext";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { readRunExecutionBackend } from "../server/persistence/postgres/runExecutionRepository";

export async function runWithResearchExecution<Value>(
  database: ResearchDatabase,
  runId: string,
  action: () => Value,
): Promise<Value> {
  return codexExecutionContext.run(
    await readRunExecutionBackend(database, runId),
    action,
  );
}

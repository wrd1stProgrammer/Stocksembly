import { codexExecutionContext } from "../server/codex/codexExecutionContext";
import { readRunExecutionBackend } from "../server/persistence/sqlite/runExecutionRepository";

export function runWithResearchExecution<Value>(
  databasePath: string,
  runId: string,
  action: () => Value,
): Value {
  return codexExecutionContext.run(
    readRunExecutionBackend(databasePath, runId),
    action,
  );
}

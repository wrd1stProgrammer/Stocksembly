import { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import { ChairSynthesisSqliteAuthority } from "./chairSynthesisAuthority";
import type {
  SqliteChairSynthesis,
  SqliteChairSynthesisOptions,
} from "./chairSynthesisContracts";
import { createChairSynthesisAttemptHandler } from "./chairSynthesisHandler";
import { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

export function createSqliteChairSynthesis(
  options: SqliteChairSynthesisOptions,
): SqliteChairSynthesis {
  const migrationOptions =
    options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory };
  const authority = new ChairSynthesisSqliteAuthority(options.databasePath, {
    cas: options.cas,
    workflowVersion: options.workflowVersion ?? "workflow-v3",
    ...migrationOptions,
  });
  const workflowAuthority = new SpecialistRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const commitStore = new SqliteAgentOutputCommitStore(
    options.databasePath,
    migrationOptions,
  );
  const handler = createChairSynthesisAttemptHandler({
    options,
    authority,
    workflowAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  return {
    authority: "sqlite-worker-trusted-commit",
    async stage(input) {
      const result = await authority.stage(input.runId, now());
      return result === true
        ? { kind: "staged" }
        : { kind: "blocked", reason: result };
    },
    async drain(runId) {
      const engine = createLeaseEngine({
        databasePath: options.databasePath,
        ownerId: options.ownerId,
        handler,
        clock: { now },
      });
      for (;;) {
        const results = await Promise.all([
          engine.poll(),
          engine.poll(),
          engine.poll(),
        ]);
        if (results.every((result) => result.kind === "idle")) break;
      }
      await engine.shutdown();
      return authority.replay(runId);
    },
    replay: (runId) => authority.replay(runId),
    async close() {
      commitStore.close();
      workflowAuthority.close();
      authority.close();
    },
  };
}

export type {
  ChairSynthesisPrompt,
  ChairSynthesisReplay,
  SqliteChairSynthesis,
  SqliteChairSynthesisOptions,
} from "./chairSynthesisContracts";

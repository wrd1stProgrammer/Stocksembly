import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";
import type {
  SpecialistRoundReplay,
  SqliteSpecialistRound,
  SqliteSpecialistRoundOptions,
} from "./specialistRoundSqliteContracts";
import { createSpecialistRoundAttemptHandler } from "./specialistRoundSqliteHandler";
import { stageSqliteSpecialistRound } from "./specialistRoundSqliteStage";

export type {
  SpecialistRoundReplay,
  SpecialistSourceArtifact,
  SqliteSpecialistRound,
  SqliteSpecialistRoundOptions,
} from "./specialistRoundSqliteContracts";

function replayResult(
  runId: string,
  authority: SpecialistRoundSqliteAuthority,
): SpecialistRoundReplay {
  const replay = authority.replay(runId);
  return {
    runId,
    snapshotId: replay.snapshotId,
    departmentStartAllowed:
      replay.artifacts.length === WORKFLOW_V1_SPECIALIST_IDS.length &&
      new Set(replay.artifacts).size === WORKFLOW_V1_SPECIALIST_IDS.length,
    receipts: replay.receipts,
    artifactIds: replay.artifacts,
    eventSequences: replay.sequences,
  };
}

export function createSqliteSpecialistRound(
  options: SqliteSpecialistRoundOptions,
): SqliteSpecialistRound {
  const now = options.now ?? (() => new Date().toISOString());
  const migrationOptions =
    options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory };
  const store = openSqliteStore(options.databasePath, migrationOptions);
  const commitStore = new SqliteAgentOutputCommitStore(
    options.databasePath,
    migrationOptions,
  );
  const authority = new SpecialistRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const handler = createSpecialistRoundAttemptHandler({
    options,
    authority,
    commitStore,
  });

  return {
    authority: "sqlite-worker-trusted-commit",
    async stage(input, sources) {
      await stageSqliteSpecialistRound(
        { options, store, commitStore, authority },
        input,
        sources,
      );
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
      return replayResult(runId, authority);
    },
    replay: (runId) => replayResult(runId, authority),
    async close() {
      authority.close();
      commitStore.close();
      store.close();
    },
  };
}

import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import type {
  ChallengeRoundReplay,
  SqliteChallengeRound,
  SqliteChallengeRoundOptions,
} from "./challengeRoundContracts";
import { challengeJobs } from "./challengeRoundInput";
import { ChallengeRoundSqliteAuthority } from "./challengeRoundSqliteAuthority";
import { createChallengeRoundAttemptHandler } from "./challengeRoundSqliteHandler";
import { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

export type {
  ChallengeRoundReplay,
  SqliteChallengeRound,
  SqliteChallengeRoundOptions,
  StageChallengeRoundResult,
} from "./challengeRoundContracts";
export { CHALLENGE_ASSIGNMENTS } from "./challengeRoundContracts";

function replayResult(
  runId: string,
  authority: ChallengeRoundSqliteAuthority,
): ChallengeRoundReplay {
  const replay = authority.replay(runId);
  const committedChallengerIds = replay.commits.flatMap((commit) => {
    const challengerId = WORKFLOW_V1_DEPARTMENT_IDS.find(
      (id) => commit.logical_artifact_key === `challenge:${id}`,
    );
    return challengerId === undefined ? [] : [challengerId];
  });
  return {
    runId,
    snapshotId: replay.snapshotId,
    responseStartAllowed:
      committedChallengerIds.length === WORKFLOW_V1_DEPARTMENT_IDS.length &&
      new Set(committedChallengerIds).size ===
        WORKFLOW_V1_DEPARTMENT_IDS.length,
    receipts: replay.receipts,
    artifactIds: replay.commits.map((commit) => commit.artifact_id),
    committedChallengerIds,
    eventSequences: replay.commits.map((commit) => commit.sequence),
  };
}

export function createSqliteChallengeRound(
  options: SqliteChallengeRoundOptions,
): SqliteChallengeRound {
  const migrationOptions =
    options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory };
  const workflowAuthority = new SpecialistRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const challengeAuthority = new ChallengeRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const commitStore = new SqliteAgentOutputCommitStore(
    options.databasePath,
    migrationOptions,
  );
  const handler = createChallengeRoundAttemptHandler({
    options,
    workflowAuthority,
    challengeAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  return {
    authority: "sqlite-worker-trusted-commit",
    async stage(input) {
      const rows = {
        memos: challengeAuthority.acceptedRows(input.runId, "memo"),
        consolidations: challengeAuthority.acceptedRows(
          input.runId,
          "consolidation",
        ),
      };
      const prepared = await challengeJobs(options.cas, rows, {
        runId: input.runId,
        artifactIds: input.consolidationArtifactIds,
      });
      if (prepared.kind === "blocked") return prepared;
      const staged = challengeAuthority.stageJobs(
        input.runId,
        prepared.jobs,
        input.consolidationArtifactIds,
        now(),
      );
      return staged
        ? {
            kind: "staged",
            jobIds: prepared.jobs.map((job) => job.jobId),
          }
        : { kind: "blocked", reason: "accepted_consolidation_set_incomplete" };
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
      return replayResult(runId, challengeAuthority);
    },
    replay: (runId) => replayResult(runId, challengeAuthority),
    async close() {
      commitStore.close();
      challengeAuthority.close();
      workflowAuthority.close();
    },
  };
}

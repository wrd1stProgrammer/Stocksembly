import { WORKFLOW_V1_DEPARTMENT_IDS } from "../domain/roleRegistry";
import { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import type {
  ChallengeRoundReplay,
  PostgresChallengeRound,
  PostgresChallengeRoundOptions,
} from "./challengeRoundContracts";
import { challengeJobs } from "./challengeRoundInput";
import { ChallengeRoundPostgresAuthority } from "./challengeRoundPostgresAuthority";
import { createChallengeRoundAttemptHandler } from "./challengeRoundPostgresHandler";
import { SpecialistRoundPostgresAuthority } from "./specialistRoundPostgresAuthority";

export type {
  ChallengeRoundReplay,
  PostgresChallengeRound,
  PostgresChallengeRoundOptions,
  StageChallengeRoundResult,
} from "./challengeRoundContracts";
export { CHALLENGE_ASSIGNMENTS } from "./challengeRoundContracts";

async function replayResult(
  runId: string,
  authority: ChallengeRoundPostgresAuthority,
): Promise<ChallengeRoundReplay> {
  const replay = await authority.replay(runId);
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

export function createPostgresChallengeRound(
  options: PostgresChallengeRoundOptions,
): PostgresChallengeRound {
  const workflowAuthority = new SpecialistRoundPostgresAuthority(
    options.database,
  );
  const challengeAuthority = new ChallengeRoundPostgresAuthority(
    options.database,
  );
  const commitStore = new PostgresAgentOutputCommitStore(options.database);
  const handler = createChallengeRoundAttemptHandler({
    options,
    workflowAuthority,
    challengeAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  return {
    authority: "postgres-worker-trusted-commit",
    async stage(input) {
      const rows = {
        memos: await challengeAuthority.acceptedRows(input.runId, "memo"),
        consolidations: await challengeAuthority.acceptedRows(
          input.runId,
          "consolidation",
        ),
      };
      const prepared = await challengeJobs(options.cas, rows, {
        runId: input.runId,
        artifactIds: input.consolidationArtifactIds,
      });
      if (prepared.kind === "blocked") return prepared;
      const staged = await challengeAuthority.stageJobs(
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
        pool: options.database,
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
      return await replayResult(runId, challengeAuthority);
    },
    replay: async (runId) => await replayResult(runId, challengeAuthority),
    async close() {
      await commitStore.close();
      challengeAuthority.close();
      workflowAuthority.close();
    },
  };
}

import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { openPostgresStore } from "../server/persistence/postgres/postgresStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import { SpecialistRoundPostgresAuthority } from "./specialistRoundPostgresAuthority";
import type {
  PostgresSpecialistRound,
  PostgresSpecialistRoundOptions,
  SpecialistRoundReplay,
} from "./specialistRoundPostgresContracts";
import { createSpecialistRoundAttemptHandler } from "./specialistRoundPostgresHandler";
import { stagePostgresSpecialistRound } from "./specialistRoundPostgresStage";

export type {
  PostgresSpecialistRound,
  PostgresSpecialistRoundOptions,
  SpecialistRoundReplay,
  SpecialistSourceArtifact,
} from "./specialistRoundPostgresContracts";

async function replayResult(
  runId: string,
  authority: SpecialistRoundPostgresAuthority,
): Promise<SpecialistRoundReplay> {
  const replay = await authority.replay(runId);
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

export async function createPostgresSpecialistRound(
  options: PostgresSpecialistRoundOptions,
): Promise<PostgresSpecialistRound> {
  const now = options.now ?? (() => new Date().toISOString());
  const store = await openPostgresStore(options.database);
  const commitStore = new PostgresAgentOutputCommitStore(options.database);
  const authority = new SpecialistRoundPostgresAuthority(options.database);
  const handler = createSpecialistRoundAttemptHandler({
    options,
    authority,
    commitStore,
  });

  return {
    authority: "postgres-worker-trusted-commit",
    async stage(input, sources) {
      await stagePostgresSpecialistRound(
        { options, store, commitStore, authority },
        input,
        sources,
      );
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
      return await replayResult(runId, authority);
    },
    replay: async (runId) => await replayResult(runId, authority),
    async close() {
      authority.close();
      await commitStore.close();
      await store.close();
    },
  };
}

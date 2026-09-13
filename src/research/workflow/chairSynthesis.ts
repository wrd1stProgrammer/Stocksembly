import { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import { ChairSynthesisPostgresAuthority } from "./chairSynthesisAuthority";
import type {
  PostgresChairSynthesis,
  PostgresChairSynthesisOptions,
} from "./chairSynthesisContracts";
import { createChairSynthesisAttemptHandler } from "./chairSynthesisHandler";
import { SpecialistRoundPostgresAuthority } from "./specialistRoundPostgresAuthority";

export function createPostgresChairSynthesis(
  options: PostgresChairSynthesisOptions,
): PostgresChairSynthesis {
  const authority = new ChairSynthesisPostgresAuthority(options.database, {
    cas: options.cas,
    workflowVersion: options.workflowVersion ?? "workflow-v3",
  });
  const workflowAuthority = new SpecialistRoundPostgresAuthority(
    options.database,
  );
  const commitStore = new PostgresAgentOutputCommitStore(options.database);
  const handler = createChairSynthesisAttemptHandler({
    options,
    authority,
    workflowAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  return {
    authority: "postgres-worker-trusted-commit",
    async stage(input) {
      const result = await authority.stage(input.runId, now());
      return result === true
        ? { kind: "staged" }
        : { kind: "blocked", reason: result };
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
      return await authority.replay(runId);
    },
    replay: async (runId) => await authority.replay(runId),
    async close() {
      await commitStore.close();
      workflowAuthority.close();
      authority.close();
    },
  };
}

export type {
  ChairSynthesisPrompt,
  ChairSynthesisReplay,
  PostgresChairSynthesis,
  PostgresChairSynthesisOptions,
} from "./chairSynthesisContracts";

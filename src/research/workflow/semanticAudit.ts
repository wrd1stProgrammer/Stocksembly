import { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import { SemanticAuditPostgresAuthority } from "./semanticAuditAuthority";
import {
  type PostgresSemanticAudit,
  type PostgresSemanticAuditOptions,
  type SemanticAuditReplay,
  SemanticAuditStageInputSchema,
} from "./semanticAuditContracts";
import { createSemanticAuditAttemptHandler } from "./semanticAuditHandler";
import { SpecialistRoundPostgresAuthority } from "./specialistRoundPostgresAuthority";

export function createPostgresSemanticAudit(
  options: PostgresSemanticAuditOptions,
): PostgresSemanticAudit {
  const workflowAuthority = new SpecialistRoundPostgresAuthority(
    options.database,
  );
  const authority = new SemanticAuditPostgresAuthority(options.database, {
    cas: options.cas,
  });
  const commitStore = new PostgresAgentOutputCommitStore(options.database);
  const handler = createSemanticAuditAttemptHandler({
    options,
    authority,
    workflowAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  return {
    authority: "postgres-worker-trusted-commit",
    async stage(input) {
      const parsed = SemanticAuditStageInputSchema.safeParse(input);
      if (!parsed.success) return { kind: "blocked", reason: "invalid_input" };
      const staged = await authority.stage(parsed.data, now());
      if (staged === true) return { kind: "staged" };
      return { kind: "blocked", reason: staged };
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
    replay: async (runId): Promise<SemanticAuditReplay> =>
      await authority.replay(runId),
    async close() {
      await commitStore.close();
      authority.close();
      workflowAuthority.close();
    },
  };
}

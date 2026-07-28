import { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { createLeaseEngine } from "../worker/leaseEngine";
import { SemanticAuditSqliteAuthority } from "./semanticAuditAuthority";
import {
  type SemanticAuditReplay,
  SemanticAuditStageInputSchema,
  type SqliteSemanticAudit,
  type SqliteSemanticAuditOptions,
} from "./semanticAuditContracts";
import { createSemanticAuditAttemptHandler } from "./semanticAuditHandler";
import { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

export function createSqliteSemanticAudit(
  options: SqliteSemanticAuditOptions,
): SqliteSemanticAudit {
  const migrationOptions =
    options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory };
  const workflowAuthority = new SpecialistRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const authority = new SemanticAuditSqliteAuthority(options.databasePath, {
    ...migrationOptions,
    cas: options.cas,
  });
  const commitStore = new SqliteAgentOutputCommitStore(
    options.databasePath,
    migrationOptions,
  );
  const handler = createSemanticAuditAttemptHandler({
    options,
    authority,
    workflowAuthority,
    commitStore,
  });
  const now = options.now ?? (() => new Date().toISOString());
  return {
    authority: "sqlite-worker-trusted-commit",
    async stage(input) {
      const parsed = SemanticAuditStageInputSchema.safeParse(input);
      if (!parsed.success) return { kind: "blocked", reason: "invalid_input" };
      const staged = await authority.stage(parsed.data, now());
      if (staged === true) return { kind: "staged" };
      return { kind: "blocked", reason: staged };
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
    replay: (runId): SemanticAuditReplay => authority.replay(runId),
    async close() {
      commitStore.close();
      authority.close();
      workflowAuthority.close();
    },
  };
}

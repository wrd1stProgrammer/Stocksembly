import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { SemanticAuditSqliteAuthority } from "../workflow/semanticAuditAuthority";
import { createSemanticAuditAttemptHandler } from "../workflow/semanticAuditHandler";
import type { SpecialistRoundSqliteAuthority } from "../workflow/specialistRoundSqliteAuthority";

type Context = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly attemptRoot: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
  readonly workflowAuthority: SpecialistRoundSqliteAuthority;
  readonly commitStore: SqliteAgentOutputCommitStore;
};

export function createOfficialSemanticAuditRuntime(context: Context) {
  const authority = new SemanticAuditSqliteAuthority(context.databasePath, {
    cas: context.cas,
    ...(context.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: context.migrationsDirectory }),
  });
  const handler = createSemanticAuditAttemptHandler({
    options: {
      attemptRoot: context.attemptRoot,
      cas: context.cas,
      codex: context.codex,
      ...(context.now === undefined ? {} : { now: context.now }),
    },
    authority,
    workflowAuthority: context.workflowAuthority,
    commitStore: context.commitStore,
  });
  return { authority, handler };
}

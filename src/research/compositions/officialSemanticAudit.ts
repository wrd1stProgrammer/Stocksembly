import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import type { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { SemanticAuditPostgresAuthority } from "../workflow/semanticAuditAuthority";
import { createSemanticAuditAttemptHandler } from "../workflow/semanticAuditHandler";
import type { SpecialistRoundPostgresAuthority } from "../workflow/specialistRoundPostgresAuthority";

type Context = {
  readonly database: ResearchDatabase;

  readonly attemptRoot: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
  readonly workflowAuthority: SpecialistRoundPostgresAuthority;
  readonly commitStore: PostgresAgentOutputCommitStore;
};

export function createOfficialSemanticAuditRuntime(context: Context) {
  const authority = new SemanticAuditPostgresAuthority(context.database, {
    cas: context.cas,
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

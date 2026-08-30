import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { ChairSynthesisSqliteAuthority } from "../workflow/chairSynthesisAuthority";
import type { SqliteChairSynthesisOptions } from "../workflow/chairSynthesisContracts";
import { createChairSynthesisAttemptHandler } from "../workflow/chairSynthesisHandler";
import type { SpecialistRoundSqliteAuthority } from "../workflow/specialistRoundSqliteAuthority";

type Context = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly attemptRoot: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
  readonly publishReport?: SqliteChairSynthesisOptions["publishReport"];
  readonly workflowAuthority: SpecialistRoundSqliteAuthority;
  readonly commitStore: SqliteAgentOutputCommitStore;
};

export function createOfficialChairSynthesisRuntime(context: Context) {
  const authority = new ChairSynthesisSqliteAuthority(context.databasePath, {
    cas: context.cas,
    workflowVersion: "workflow-v3",
    ...(context.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: context.migrationsDirectory }),
  });
  const handler = createChairSynthesisAttemptHandler({
    options: {
      attemptRoot: context.attemptRoot,
      cas: context.cas,
      codex: context.codex,
      workflowVersion: "workflow-v3",
      ...(context.now === undefined ? {} : { now: context.now }),
      ...(context.publishReport === undefined
        ? {}
        : { publishReport: context.publishReport }),
    },
    authority,
    workflowAuthority: context.workflowAuthority,
    commitStore: context.commitStore,
  });
  return { authority, handler };
}

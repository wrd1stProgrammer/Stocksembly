import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import type { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { ChairSynthesisPostgresAuthority } from "../workflow/chairSynthesisAuthority";
import type { PostgresChairSynthesisOptions } from "../workflow/chairSynthesisContracts";
import { createChairSynthesisAttemptHandler } from "../workflow/chairSynthesisHandler";
import type { SpecialistRoundPostgresAuthority } from "../workflow/specialistRoundPostgresAuthority";

type Context = {
  readonly database: ResearchDatabase;

  readonly attemptRoot: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
  readonly publishReport?: PostgresChairSynthesisOptions["publishReport"];
  readonly workflowAuthority: SpecialistRoundPostgresAuthority;
  readonly commitStore: PostgresAgentOutputCommitStore;
};

export function createOfficialChairSynthesisRuntime(context: Context) {
  const authority = new ChairSynthesisPostgresAuthority(context.database, {
    cas: context.cas,
    workflowVersion: "workflow-v3",
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

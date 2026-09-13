import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { Pool } from "pg";
import { LIMITS } from "../domain/limits.constants";
import type { ArtifactCasPort } from "../ports/artifacts";
import { createFilesystemArtifactStore } from "../server/artifacts/filesystemArtifactStore";
import {
  createLiveS3ArtifactArchive,
  S3MirroredArtifactStore,
} from "../server/artifacts/s3ArtifactArchive";
import { productionCodexPlatform } from "../server/codex/codexPlatform";
import { type CodexPort, createCodexPort } from "../server/codex/codexRunner";
import { PostgresAgentOutputCommitStore } from "../server/persistence/postgres/postgresAgentOutputCommitStore";
import { publishAuthoritativeReportForRun } from "../server/persistence/postgres/publishAuthoritativeReportForRun";
import { createQuestionAnswerHandler } from "../server/qa/questionAnswerHandler";
import { QuestionAnswerPostgresAuthority } from "../server/qa/questionAnswerPostgresAuthority";
import {
  backfillPublishedResearchQuestionLocalizations,
  ensurePublishedResearchQuestionLocalizations,
} from "../server/researchRoom/researchRoomLocalizations";
import type { AttemptHandler } from "../worker/leaseEngine";
import { createPostgresChairSynthesis } from "../workflow/chairSynthesis";
import type { PostgresChairSynthesisOptions } from "../workflow/chairSynthesisContracts";
import { createPostgresChallengeRound } from "../workflow/challengeRound";
import { ChallengeRoundPostgresAuthority } from "../workflow/challengeRoundPostgresAuthority";
import { createChallengeRoundAttemptHandler } from "../workflow/challengeRoundPostgresHandler";
import { createPostgresDepartmentRound } from "../workflow/departmentRound";
import { DepartmentRoundPostgresAuthority } from "../workflow/departmentRoundPostgresAuthority";
import { createDepartmentRoundAttemptHandler } from "../workflow/departmentRoundPostgresHandler";
import { createPostgresFollowupAndResponseRound } from "../workflow/followupAndResponseRound";
import { FollowupAndResponseRoundPostgresAuthority } from "../workflow/followupAndResponseRoundPostgresAuthority";
import { createFollowupAndResponseAttemptHandler } from "../workflow/followupAndResponseRoundPostgresHandler";
import { createPostgresSemanticAudit } from "../workflow/semanticAudit";
import { createPostgresSpecialistRound } from "../workflow/specialistRoundPostgres";
import { SpecialistRoundPostgresAuthority } from "../workflow/specialistRoundPostgresAuthority";
import { createSpecialistRoundAttemptHandler } from "../workflow/specialistRoundPostgresHandler";
import { createInitialCollectionHandler } from "./initialCollectionHandler";
import { createOfficialChairSynthesisRuntime } from "./officialChairSynthesis";
import { createOfficialSemanticAuditRuntime } from "./officialSemanticAudit";
import {
  CommittedArtifactMetadata,
  requireCommittedMetadata,
} from "./officialWorkerMetadata";
import { createOfficialWorkflowCoordinator } from "./officialWorkflowCoordinator";
import { runWithResearchExecution } from "./runWithResearchExecution";

export type OfficialAttemptHandlerOptions = {
  readonly dataDirectory: string;
  readonly database: Pool;
  readonly ownerId: string;
};

export type OfficialAttemptHandlerOverrides = {
  readonly cas?: ArtifactCasPort;
  readonly codex?: CodexPort;
  readonly now?: () => string;
  readonly publishReport?: PostgresChairSynthesisOptions["publishReport"];
  readonly ensurePublishedLocalizations?: typeof ensurePublishedResearchQuestionLocalizations;
};

export type OfficialAttemptHandler = {
  readonly handler: AttemptHandler;
  readonly close: () => Promise<void>;
};

export async function createOfficialAttemptHandler(
  options: OfficialAttemptHandlerOptions,
  overrides: OfficialAttemptHandlerOverrides = {},
): Promise<OfficialAttemptHandler> {
  if (options.ownerId.trim() === "")
    throw new TypeError("official worker ownerId is required");
  const authority = new SpecialistRoundPostgresAuthority(options.database);
  const commitStore = new PostgresAgentOutputCommitStore(options.database);
  const metadata =
    overrides.cas === undefined
      ? new CommittedArtifactMetadata(options.database)
      : undefined;
  const archive =
    overrides.cas === undefined ? createLiveS3ArtifactArchive() : undefined;
  const localCas =
    overrides.cas === undefined
      ? createFilesystemArtifactStore({
          dataDirectory: options.dataDirectory,
          maxBlobBytes: LIMITS.streams.maxArtifactsPerRunBytes,
          metadata: requireCommittedMetadata(metadata),
        })
      : undefined;
  const cas =
    overrides.cas ??
    (archive === undefined
      ? requireCas(localCas)
      : new S3MirroredArtifactStore(
          requireCas(localCas),
          archive,
          requireCommittedMetadata(metadata),
        ));
  const codex = overrides.codex ?? createCodexPort(authority);
  const attemptParent =
    codex.kind === "real"
      ? productionCodexPlatform().tempParent
      : options.dataDirectory;
  const attemptRootCandidate = join(
    attemptParent,
    "stocksembly-research-attempts",
  );
  mkdirSync(attemptRootCandidate, { recursive: true, mode: 0o700 });
  const attemptRoot = realpathSync(attemptRootCandidate);
  const questionAuthority = new QuestionAnswerPostgresAuthority(
    options.database,
    cas,
  );
  const questionHandler = createQuestionAnswerHandler({
    attemptRoot,
    cas,
    codex,
    commitStore,
    reservations: authority,
    questions: questionAuthority,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  });
  const publishReport =
    overrides.publishReport ??
    (async (
      request: Parameters<
        NonNullable<PostgresChairSynthesisOptions["publishReport"]>
      >[0],
    ) =>
      await publishAuthoritativeReportForRun(
        {
          database: options.database,
          cas,
          ...(overrides.now === undefined ? {} : { now: overrides.now }),
        },
        request,
      ));
  const specialistHandler = createSpecialistRoundAttemptHandler({
    options: {
      attemptRoot,
      cas,
      codex,
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
    },
    authority,
    commitStore,
  });
  const collectionHandler = await createInitialCollectionHandler({
    dataRoot: options.dataDirectory,
    database: options.database,
    cas,
    authority,
    commitStore,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  });
  const departmentAuthority = new DepartmentRoundPostgresAuthority(
    options.database,
  );
  const departmentHandler = createDepartmentRoundAttemptHandler({
    options: {
      attemptRoot,
      cas,
      codex,
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
    },
    workflowAuthority: authority,
    departmentAuthority,
    commitStore,
  });
  const challengeAuthority = new ChallengeRoundPostgresAuthority(
    options.database,
  );
  const challengeHandler = createChallengeRoundAttemptHandler({
    options: {
      attemptRoot,
      cas,
      codex,
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
    },
    workflowAuthority: authority,
    challengeAuthority,
    commitStore,
  });
  const followupResponseAuthority =
    new FollowupAndResponseRoundPostgresAuthority(options.database);
  const followupResponseHandler = createFollowupAndResponseAttemptHandler({
    options: {
      attemptRoot,
      cas,
      codex,
      ...(overrides.now === undefined ? {} : { now: overrides.now }),
    },
    workflowAuthority: authority,
    roundAuthority: followupResponseAuthority,
    commitStore,
  });
  const semantic = createOfficialSemanticAuditRuntime({
    database: options.database,
    attemptRoot,
    cas,
    codex,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
    workflowAuthority: authority,
    commitStore,
  });
  const chair = createOfficialChairSynthesisRuntime({
    database: options.database,
    attemptRoot,
    cas,
    codex,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
    workflowAuthority: authority,
    commitStore,
  });
  const coordinator = createOfficialWorkflowCoordinator({
    database: options.database,
    ownerId: options.ownerId,
    cas,
    codex,
    publishReport,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  });
  const handler: AttemptHandler = {
    run: async (attempt, signal, activity) => {
      const logicalArtifactId = await authority.logicalArtifactForAttempt(
        attempt.attemptId,
      );
      if (logicalArtifactId === "collection:initial") {
        try {
          return await collectionHandler.run(attempt, signal, activity);
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message.replaceAll(/\s+/g, " ").slice(0, 500)
              : "unknown";
          return {
            kind: "transient",
            code: `collection_runtime_error:${detail}`,
            retryAt: new Date(
              Date.parse(overrides.now?.() ?? new Date().toISOString()) +
                10_000,
            ).toISOString(),
          };
        }
      }
      if (logicalArtifactId?.startsWith("memo:") === true)
        return await specialistHandler.run(attempt, signal, activity);
      if (logicalArtifactId?.startsWith("consolidation:") === true)
        return await departmentHandler.run(attempt, signal, activity);
      if (logicalArtifactId?.startsWith("challenge:") === true)
        return await challengeHandler.run(attempt, signal, activity);
      if (
        logicalArtifactId?.startsWith("followup:") === true ||
        logicalArtifactId?.startsWith("response_ballot:") === true
      )
        return await followupResponseHandler.run(attempt, signal, activity);
      if (logicalArtifactId === "semantic_audit:system")
        return await semantic.handler.run(attempt, signal, activity);
      if (logicalArtifactId === "chair_synthesis:chair")
        return await chair.handler.run(attempt, signal, activity);
      if (logicalArtifactId?.startsWith("question:") === true)
        return await questionHandler.run(attempt, signal, activity);
      return { kind: "permanent", code: "unsupported_workflow_stage" };
    },
    afterCommit: async (attempt, outcome) => {
      if (outcome.kind === "accepted") {
        await coordinator.advance(attempt.runId);
        await (
          overrides.ensurePublishedLocalizations ??
          ensurePublishedResearchQuestionLocalizations
        )(options.database, attempt.runId);
      }
    },
    reconcile: async () => await coordinator.resumeActiveRuns(),
  };
  await coordinator.resumeActiveRuns();
  await backfillPublishedResearchQuestionLocalizations(options.database);
  return {
    handler: {
      run: async (attempt, signal, activity) =>
        await runWithResearchExecution(options.database, attempt.runId, () =>
          handler.run(attempt, signal, activity),
        ),
      afterCommit: async (attempt, outcome) =>
        await runWithResearchExecution(
          options.database,
          attempt.runId,
          async () => {
            await handler.afterCommit?.(attempt, outcome);
          },
        ),
      reconcile: async () => {
        await handler.reconcile?.();
      },
    },
    close: async () => {
      archive?.close();
      metadata?.close();
      questionAuthority.close();
      chair.authority.close();
      semantic.authority.close();
      followupResponseAuthority.close();
      challengeAuthority.close();
      departmentAuthority.close();
      await commitStore.close();
      authority.close();
    },
  };
}

function requireCas(cas: ArtifactCasPort | undefined): ArtifactCasPort {
  if (cas === undefined)
    throw new TypeError("official worker CAS is unavailable");
  return cas;
}

export {
  createPostgresChairSynthesis as createOfficialChairSynthesis,
  createPostgresChallengeRound as createOfficialChallengeRound,
  createPostgresDepartmentRound as createOfficialDepartmentRound,
  createPostgresFollowupAndResponseRound as createOfficialFollowupAndResponseRound,
  createPostgresSemanticAudit as createOfficialSemanticAudit,
  createPostgresSpecialistRound as createOfficialSpecialistRound,
};

import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { LIMITS } from "../domain/limits.constants";
import type { ArtifactCasPort } from "../ports/artifacts";
import { createFilesystemArtifactStore } from "../server/artifacts/filesystemArtifactStore";
import {
  createLiveS3ArtifactArchive,
  S3MirroredArtifactStore,
} from "../server/artifacts/s3ArtifactArchive";
import { productionCodexPlatform } from "../server/codex/codexPlatform";
import { type CodexPort, createCodexPort } from "../server/codex/codexRunner";
import { publishAuthoritativeReportForRun } from "../server/persistence/sqlite/publishAuthoritativeReportForRun";
import { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import { createQuestionAnswerHandler } from "../server/qa/questionAnswerHandler";
import { QuestionAnswerSqliteAuthority } from "../server/qa/questionAnswerSqliteAuthority";
import type { AttemptHandler } from "../worker/leaseEngine";
import { createSqliteChairSynthesis } from "../workflow/chairSynthesis";
import type { SqliteChairSynthesisOptions } from "../workflow/chairSynthesisContracts";
import { createSqliteChallengeRound } from "../workflow/challengeRound";
import { ChallengeRoundSqliteAuthority } from "../workflow/challengeRoundSqliteAuthority";
import { createChallengeRoundAttemptHandler } from "../workflow/challengeRoundSqliteHandler";
import { createSqliteDepartmentRound } from "../workflow/departmentRound";
import { DepartmentRoundSqliteAuthority } from "../workflow/departmentRoundSqliteAuthority";
import { createDepartmentRoundAttemptHandler } from "../workflow/departmentRoundSqliteHandler";
import { createSqliteFollowupAndResponseRound } from "../workflow/followupAndResponseRound";
import { FollowupAndResponseRoundSqliteAuthority } from "../workflow/followupAndResponseRoundSqliteAuthority";
import { createFollowupAndResponseAttemptHandler } from "../workflow/followupAndResponseRoundSqliteHandler";
import { createSqliteSemanticAudit } from "../workflow/semanticAudit";
import { createSqliteSpecialistRound } from "../workflow/specialistRoundSqlite";
import { SpecialistRoundSqliteAuthority } from "../workflow/specialistRoundSqliteAuthority";
import { createSpecialistRoundAttemptHandler } from "../workflow/specialistRoundSqliteHandler";
import { createInitialCollectionHandler } from "./initialCollectionHandler";
import { createOfficialChairSynthesisRuntime } from "./officialChairSynthesis";
import { createOfficialSemanticAuditRuntime } from "./officialSemanticAudit";
import {
  CommittedArtifactMetadata,
  requireCommittedMetadata,
} from "./officialWorkerMetadata";
import { createOfficialWorkflowCoordinator } from "./officialWorkflowCoordinator";

export type OfficialAttemptHandlerOptions = {
  readonly dataDirectory: string;
  readonly databasePath: string;
  readonly ownerId: string;
  readonly migrationsDirectory?: string;
};

export type OfficialAttemptHandlerOverrides = {
  readonly cas?: ArtifactCasPort;
  readonly codex?: CodexPort;
  readonly now?: () => string;
  readonly publishReport?: SqliteChairSynthesisOptions["publishReport"];
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
  const migrationOptions =
    options.migrationsDirectory === undefined
      ? {}
      : { migrationsDirectory: options.migrationsDirectory };
  const authority = new SpecialistRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
  const commitStore = new SqliteAgentOutputCommitStore(
    options.databasePath,
    migrationOptions,
  );
  const metadata =
    overrides.cas === undefined
      ? new CommittedArtifactMetadata(options.databasePath)
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
  const questionAuthority = new QuestionAnswerSqliteAuthority(
    options.databasePath,
    cas,
    options.migrationsDirectory,
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
    ((
      request: Parameters<
        NonNullable<SqliteChairSynthesisOptions["publishReport"]>
      >[0],
    ) =>
      publishAuthoritativeReportForRun(
        {
          databasePath: options.databasePath,
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
  const collectionHandler = createInitialCollectionHandler({
    dataRoot: options.dataDirectory,
    databasePath: options.databasePath,
    ...migrationOptions,
    cas,
    authority,
    commitStore,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  });
  const departmentAuthority = new DepartmentRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
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
  const challengeAuthority = new ChallengeRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
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
  const followupResponseAuthority = new FollowupAndResponseRoundSqliteAuthority(
    options.databasePath,
    migrationOptions,
  );
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
    databasePath: options.databasePath,
    ...migrationOptions,
    attemptRoot,
    cas,
    codex,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
    workflowAuthority: authority,
    commitStore,
  });
  const chair = createOfficialChairSynthesisRuntime({
    databasePath: options.databasePath,
    ...migrationOptions,
    attemptRoot,
    cas,
    codex,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
    workflowAuthority: authority,
    commitStore,
  });
  const coordinator = createOfficialWorkflowCoordinator({
    databasePath: options.databasePath,
    ...migrationOptions,
    ownerId: options.ownerId,
    cas,
    codex,
    publishReport,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  });
  const handler: AttemptHandler = {
    run: async (attempt, signal, activity) => {
      const logicalArtifactId = authority.logicalArtifactForAttempt(
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
      if (outcome.kind === "accepted") await coordinator.advance(attempt.runId);
    },
    reconcile: async () => await coordinator.resumeActiveRuns(),
  };
  await coordinator.resumeActiveRuns();
  return {
    handler,
    close: async () => {
      archive?.close();
      metadata?.close();
      questionAuthority.close();
      chair.authority.close();
      semantic.authority.close();
      followupResponseAuthority.close();
      challengeAuthority.close();
      departmentAuthority.close();
      commitStore.close();
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
  createSqliteChairSynthesis as createOfficialChairSynthesis,
  createSqliteChallengeRound as createOfficialChallengeRound,
  createSqliteDepartmentRound as createOfficialDepartmentRound,
  createSqliteFollowupAndResponseRound as createOfficialFollowupAndResponseRound,
  createSqliteSemanticAudit as createOfficialSemanticAudit,
  createSqliteSpecialistRound as createOfficialSpecialistRound,
};

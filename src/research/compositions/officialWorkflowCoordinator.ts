import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { z } from "zod";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  QuestionIdSchema,
  RunIdSchema,
} from "../domain/ids";
import {
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_ROLE_REGISTRY,
  type WorkflowDepartmentId,
} from "../domain/roleRegistry";
import type { ArtifactCasPort } from "../ports/artifacts";
import type { CodexPort } from "../server/codex/codexRunner";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { publishDepartmentReportForRun } from "../server/persistence/postgres/publishDepartmentReportForRun";
import { transitionRun } from "../server/persistence/postgres/runRepository";
import { chairResumeReceiptExceptionAvailable } from "../workflow/chairResumePermit";
import { createPostgresChairSynthesis } from "../workflow/chairSynthesis";
import { createPostgresChallengeRound } from "../workflow/challengeRound";
import { createPostgresDepartmentRound } from "../workflow/departmentRound";
import { createPostgresFollowupAndResponseRound } from "../workflow/followupAndResponseRound";
import { createPostgresSemanticAudit } from "../workflow/semanticAudit";
import { persistStructuralAudit } from "../workflow/structuralAuditPersistence";
import { buildOfficialStructuralAuditInput } from "./officialStructuralAuditInput";
import { runWithResearchExecution } from "./runWithResearchExecution";
import {
  clearStageRecovery,
  isRecoverableWorkflowFailure,
  persistWorkflowQualityOutcome,
  scheduleStageRecovery,
  stageRecoveryState,
  workflowFailureDisposition,
} from "./workflowStageRecovery";

type CoordinatorOptions = {
  readonly database: Pool;

  readonly ownerId: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly now?: () => string;
  readonly publishReport: NonNullable<
    Parameters<typeof createPostgresChairSynthesis>[0]["publishReport"]
  >;
};

function reportBlocked(stage: string, reason: string): void {
  process.stderr.write(
    `${JSON.stringify({ kind: "workflow_stage_blocked", stage, reason })}\n`,
  );
}

async function terminalizeLegacyPublication(
  database: ResearchDatabase,
  runId: string,
  occurredAt: string,
): Promise<boolean> {
  const row = z
    .object({ status: z.string(), version: z.number().int().nonnegative() })
    .safeParse(
      (
        await database.query(
          `SELECT status, version FROM runs WHERE run_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM artifacts
            WHERE artifacts.run_id = runs.run_id
              AND artifacts.logical_key = 'memo:benchmark'
          )`,
          [runId],
        )
      ).rows[0],
    );
  if (!row.success || row.data.status !== "running") return false;
  await transitionRun(database, {
    runId: RunIdSchema.parse(runId),
    fromStatus: "running",
    toStatus: "incomplete",
    expectedVersion: row.data.version,
    nextJobs: [],
    event: {
      eventId: EventIdSchema.parse(randomUUID()),
      type: "run_incomplete",
      stateId: "incomplete",
      occurredAt,
      payload: {
        code: "workflow_version_superseded",
        summary: {
          en: "This earlier run used the retired research roster. Start a new analysis to include the benchmark and cross-asset review.",
          ko: "이 실행은 이전 에이전트 구성으로 시작됐습니다. 벤치마크·교차자산 검토를 포함하려면 새 분석을 시작해 주세요.",
        },
      },
    },
  });
  return true;
}

async function terminalizeWorkflowFailure(
  database: ResearchDatabase,
  runId: string,
  stage: string,
  reason: string,
  occurredAt: string,
): Promise<boolean> {
  const row = z
    .object({ status: z.string(), version: z.number().int().nonnegative() })
    .safeParse(
      (
        await database.query(
          "SELECT status, version FROM runs WHERE run_id = $1",
          [runId],
        )
      ).rows[0],
    );
  if (!row.success || row.data.status !== "running") return false;
  const publicationOnlyFailure = stage === "report_publication";
  await transitionRun(database, {
    runId: RunIdSchema.parse(runId),
    fromStatus: "running",
    toStatus: "incomplete",
    expectedVersion: row.data.version,
    nextJobs: [],
    event: {
      eventId: EventIdSchema.parse(randomUUID()),
      type: "run_incomplete",
      stateId: "incomplete",
      occurredAt,
      payload: {
        code: workflowFailureCode(stage, reason),
        summary: publicationOnlyFailure
          ? {
              en: "The analysis was completed, but the report could not be published. Finished analysis was preserved and no research credit was charged.",
              ko: "분석은 완료됐지만 보고서를 발행하지 못했습니다. 완료된 분석은 보존되며 리서치 크레딧은 차감되지 않습니다.",
            }
          : {
              en: "Research could not be completed. Finished stages were preserved and no research credit was charged.",
              ko: "리서치를 완성하지 못했습니다. 완료된 단계는 보존되며 리서치 크레딧은 차감되지 않습니다.",
            },
      },
    },
  });
  return true;
}

async function recoverOrTerminalize(
  database: ResearchDatabase,
  runId: string,
  stage: string,
  reason: string,
  occurredAt: string,
): Promise<void> {
  const disposition = workflowFailureDisposition(reason);
  if (disposition === "item_omitted" || disposition === "quality_degraded") {
    await persistWorkflowQualityOutcome({
      database,
      runId,
      outcome: disposition,
      reason,
      observedAt: occurredAt,
    });
    process.stderr.write(
      `${JSON.stringify({ kind: "workflow_stage_degraded", stage, reason })}\n`,
    );
    return;
  }
  if (disposition === "run_failed" || !isRecoverableWorkflowFailure(reason)) {
    if (disposition === "run_failed")
      await persistWorkflowQualityOutcome({
        database,
        runId,
        outcome: disposition,
        reason,
        observedAt: occurredAt,
      });
    await terminalizeWorkflowFailure(
      database,
      runId,
      stage,
      reason,
      occurredAt,
    );
    return;
  }
  const recovery = await scheduleStageRecovery({
    database,
    runId,
    stage,
    reason,
    now: occurredAt,
  });
  if (recovery === "exhausted")
    await terminalizeWorkflowFailure(
      database,
      runId,
      stage,
      "automatic_recovery_exhausted",
      occurredAt,
    );
}

export async function routeOfficialWorkflowFailure(input: {
  readonly database: Pool;
  readonly runId: string;
  readonly stage: string;
  readonly reason: string;
  readonly occurredAt: string;
}): Promise<void> {
  await recoverOrTerminalize(
    input.database,
    input.runId,
    input.stage,
    input.reason,
    input.occurredAt,
  );
}

export function workflowFailureCode(stage: string, reason: string): string {
  return reason.startsWith("editorial_quality_failed:")
    ? reason
    : `${stage}:${reason}`;
}

type SemanticAuditCoordinatorInput = {
  readonly artifactIds: readonly string[];
  readonly blockers: readonly string[];
  readonly incompleteReason:
    | "semantic_artifact_missing"
    | "replacement_exhausted"
    | "retry_pending"
    | null;
  readonly publishable: boolean;
};

export function semanticAuditCoordinatorAction(
  replay: SemanticAuditCoordinatorInput,
): "advance" | "stage" | "terminalize" | "wait" {
  if (replay.publishable) return "advance";
  // A material contradiction removes or downgrades the affected claim in the
  // chair prompt; it must not discard the otherwise valid audit artifact.
  if (replay.artifactIds.length > 0) return "advance";
  if (replay.incompleteReason === "retry_pending") return "wait";
  if (replay.incompleteReason === "replacement_exhausted") return "terminalize";
  return "stage";
}

const AcceptedChairSchema = z.object({
  artifactId: ArtifactIdSchema,
  jobId: JobIdSchema,
  attemptId: AttemptIdSchema,
  ordinal: z.number().int().positive(),
  ownerId: z.string().min(1),
  token: z.number().int().positive(),
});

const StructuralAuditRowSchema = z.object({
  artifactId: ArtifactIdSchema,
});

async function acceptedStructuralAudit(
  database: ResearchDatabase,
  runId: string,
): Promise<z.infer<typeof ArtifactIdSchema> | undefined> {
  const row = StructuralAuditRowSchema.safeParse(
    (
      await database.query(
        `SELECT artifacts.artifact_id AS "artifactId"
          FROM idempotency_records
          JOIN artifacts ON artifacts.artifact_id = (idempotency_records.result_json::jsonb ->> 'structuralAuditArtifactId')
          WHERE idempotency_records.scope = 'structural-audit'
            AND idempotency_records.idempotency_key = $1
            AND (idempotency_records.result_json::jsonb ->> 'publishable')::boolean = true
            AND artifacts.run_id = $2
            AND artifacts.logical_key = 'structural_audit:system'
          LIMIT 1`,
        [runId, runId],
      )
    ).rows[0],
  );
  return row.success ? row.data.artifactId : undefined;
}

async function acceptedChair(database: ResearchDatabase, runId: string) {
  return AcceptedChairSchema.parse(
    (
      await database.query(
        `SELECT agent_output_commits.artifact_id AS "artifactId",
          attempts.job_id AS "jobId", attempts.attempt_id AS "attemptId",
          agent_output_commits.ordinal, agent_output_commits.owner_id AS "ownerId",
          agent_output_commits.fence_token AS token
        FROM agent_output_commits JOIN attempts USING(attempt_id)
        WHERE attempts.run_id = $1
          AND attempts.logical_artifact_key = 'chair_synthesis:chair'`,
        [runId],
      )
    ).rows[0],
  );
}

async function departmentTargetForRun(
  database: ResearchDatabase,
  runId: string,
): Promise<WorkflowDepartmentId | undefined> {
  const row = z
    .object({
      research_kind: z.enum(["committee", "department"]),
      department_id: z
        .enum(["market", "company", "financial", "risk"])
        .nullable(),
    })
    .safeParse(
      (
        await database.query(
          `SELECT research_kind, department_id
            FROM research_requests WHERE run_id = $1`,
          [runId],
        )
      ).rows[0],
    );
  if (!row.success) return undefined;
  return row.data.research_kind === "department" &&
    row.data.department_id !== null
    ? row.data.department_id
    : undefined;
}

export type OfficialWorkflowCoordinator = {
  readonly advance: (runId: string) => Promise<void>;
  readonly resumeActiveRuns: () => Promise<void>;
};

export function createOfficialWorkflowCoordinator(
  options: CoordinatorOptions,
): OfficialWorkflowCoordinator {
  const roundOptions = {
    database: options.database,
    attemptRoot: join(realpathSync(tmpdir()), "stocksembly-research-attempts"),
    ownerId: options.ownerId,
    cas: options.cas,
    codex: options.codex,

    ...(options.now === undefined ? {} : { now: options.now }),
  };
  const runTails = new Map<string, Promise<void>>();

  const advanceExclusive = async (rawRunId: string): Promise<void> => {
    const runId = RunIdSchema.parse(rawRunId);
    const departmentTarget = await departmentTargetForRun(
      options.database,
      runId,
    );
    if (departmentTarget !== undefined) {
      const departments = createPostgresDepartmentRound(roundOptions);
      try {
        const replay = await departments.replay(runId);
        if (!replay.committedDepartmentIds.includes(departmentTarget)) {
          const acceptedMemos = await departments.acceptedMemos(runId);
          const expectedRoles =
            WORKFLOW_V1_ROLE_REGISTRY.departments[departmentTarget].memberIds;
          const acceptedByRole = new Map(
            acceptedMemos.map((memo) => [memo.roleId, memo]),
          );
          if (expectedRoles.every((roleId) => acceptedByRole.has(roleId))) {
            const staged = await departments.stage({
              runId,
              memberArtifactIds: expectedRoles.flatMap((roleId) => {
                const memo = acceptedByRole.get(roleId);
                return memo === undefined ? [] : [memo.artifactId];
              }),
            });
            if (staged.kind === "blocked")
              reportBlocked("department", staged.reason);
          }
          return;
        }
        const departmentPublicationNow =
          options.now?.() ?? new Date().toISOString();
        if (
          (await stageRecoveryState(
            options.database,
            runId,
            "department_report_publication",
            departmentPublicationNow,
          )) !== "ready"
        )
          return;
        let published:
          | { readonly kind: "published" }
          | { readonly kind: "incomplete"; readonly reason: string };
        try {
          published = await publishDepartmentReportForRun(
            {
              database: options.database,
              cas: options.cas,
              ...(options.now === undefined ? {} : { now: options.now }),
            },
            runId,
          );
        } catch (error) {
          reportBlocked(
            "department_report_publication",
            error instanceof Error ? error.message : "runtime_error",
          );
          published = {
            kind: "incomplete",
            reason: "publication_runtime_error",
          };
        }
        if (published.kind !== "published") {
          await recoverOrTerminalize(
            options.database,
            runId,
            "department_report_publication",
            published.reason,
            departmentPublicationNow,
          );
          return;
        }
        await clearStageRecovery(
          options.database,
          runId,
          "department_report_publication",
        );
        return;
      } finally {
        await departments.close();
      }
    }
    const departments = createPostgresDepartmentRound(roundOptions);
    const challenges = createPostgresChallengeRound(roundOptions);
    const responses = createPostgresFollowupAndResponseRound(roundOptions);
    const semantic = createPostgresSemanticAudit(roundOptions);
    const chair = createPostgresChairSynthesis({
      ...roundOptions,
      publishReport: options.publishReport,
    });
    try {
      const departmentReplay = await departments.replay(runId);
      if (!departmentReplay.challengeStartAllowed) {
        const memos = await departments.acceptedMemos(runId);
        const acceptedRoles = new Set(memos.map((memo) => memo.roleId));
        const hasReadyDepartment = WORKFLOW_V1_DEPARTMENT_IDS.some(
          (departmentId) =>
            WORKFLOW_V1_ROLE_REGISTRY.departments[departmentId].memberIds.every(
              (roleId) => acceptedRoles.has(roleId),
            ),
        );
        if (hasReadyDepartment) {
          const staged = await departments.stage({
            runId,
            memberArtifactIds: memos.map((memo) => memo.artifactId),
          });
          if (staged.kind === "blocked")
            reportBlocked("department", staged.reason);
        }
        return;
      }

      const challengeReplay = await challenges.replay(runId);
      if (!challengeReplay.responseStartAllowed) {
        const staged = await challenges.stage({
          runId,
          consolidationArtifactIds: departmentReplay.artifactIds.map((id) =>
            ArtifactIdSchema.parse(id),
          ),
        });
        if (staged.kind === "blocked")
          reportBlocked("challenge", staged.reason);
        return;
      }

      let responseReplay = await responses.replay(runId);
      if (!responseReplay.responseStartAllowed) {
        if (responseReplay.incompleteReason === "plan_not_staged") {
          const staged = await responses.stage({
            runId,
            challengeArtifactIds: challengeReplay.artifactIds.map((id) =>
              ArtifactIdSchema.parse(id),
            ),
          });
          if (staged.kind === "blocked")
            reportBlocked("followup_response", staged.reason);
        }
        responseReplay = await responses.advance(runId);
      }
      if (!responseReplay.responseStartAllowed) return;

      const structuralInput = await buildOfficialStructuralAuditInput({
        database: options.database,
        cas: options.cas,
        runId,
      });
      let structuralAuditArtifactId = await acceptedStructuralAudit(
        options.database,
        runId,
      );
      if (structuralAuditArtifactId === undefined) {
        const structuralNow = options.now?.() ?? new Date().toISOString();
        if (
          (await stageRecoveryState(
            options.database,
            runId,
            "structural_audit",
            structuralNow,
          )) !== "ready"
        )
          return;
        const structural = await persistStructuralAudit(
          {
            database: options.database,
            cas: options.cas,

            ...(options.now === undefined ? {} : { now: options.now }),
          },
          structuralInput,
        );
        if (structural.kind !== "persisted") {
          await recoverOrTerminalize(
            options.database,
            runId,
            "structural_audit",
            structural.reason,
            structuralNow,
          );
          return;
        }
        if (!structural.publishable) {
          await recoverOrTerminalize(
            options.database,
            runId,
            "structural_audit",
            "publication_blocked",
            structuralNow,
          );
          return;
        }
        await clearStageRecovery(options.database, runId, "structural_audit");
        structuralAuditArtifactId = ArtifactIdSchema.parse(
          structural.structuralAuditArtifactId,
        );
      }
      const trustedStructuralAuditArtifactId = ArtifactIdSchema.parse(
        structuralAuditArtifactId,
      );

      const semanticReplay = await semantic.replay(runId);
      const semanticAction = semanticAuditCoordinatorAction(semanticReplay);
      if (semanticAction === "wait") return;
      if (semanticAction === "terminalize") {
        await terminalizeWorkflowFailure(
          options.database,
          runId,
          "semantic_audit",
          semanticReplay.blockers[0] ??
            semanticReplay.incompleteReason ??
            "publication_blocked",
          options.now?.() ?? new Date().toISOString(),
        );
        return;
      }
      if (semanticAction === "stage") {
        const semanticNow = options.now?.() ?? new Date().toISOString();
        if (
          (await stageRecoveryState(
            options.database,
            runId,
            "semantic_audit",
            semanticNow,
          )) !== "ready"
        )
          return;
        const staged = await semantic.stage({
          runId,
          structuralAuditArtifactId: trustedStructuralAuditArtifactId,
          questions: structuralInput.retainedOpenQuestionIds.map((id) =>
            QuestionIdSchema.parse(id),
          ),
        });
        if (staged.kind === "blocked") {
          await recoverOrTerminalize(
            options.database,
            runId,
            "semantic_audit",
            staged.reason,
            semanticNow,
          );
          return;
        }
        await clearStageRecovery(options.database, runId, "semantic_audit");
        return;
      }

      const chairReplay = await chair.replay(runId);
      if (!chairReplay.publishable) {
        if (chairReplay.incompleteReason === "retry_pending") {
          const refreshed = await chair.stage({ runId });
          if (refreshed.kind === "blocked")
            reportBlocked("chair_synthesis", refreshed.reason);
          return;
        }
        if (
          chairReplay.incompleteReason === "replacement_exhausted" &&
          (await chairResumeReceiptExceptionAvailable(options.database, runId))
        )
          return;
        if (
          chairReplay.artifactIds.length > 0 ||
          chairReplay.incompleteReason === "replacement_exhausted"
        ) {
          await recoverOrTerminalize(
            options.database,
            runId,
            "chair_synthesis",
            chairReplay.incompleteReason ?? "publication_blocked",
            options.now?.() ?? new Date().toISOString(),
          );
          return;
        }
        const chairNow = options.now?.() ?? new Date().toISOString();
        if (
          (await stageRecoveryState(
            options.database,
            runId,
            "chair_synthesis",
            chairNow,
          )) !== "ready"
        )
          return;
        const staged = await chair.stage({ runId });
        if (staged.kind === "blocked") {
          await recoverOrTerminalize(
            options.database,
            runId,
            "chair_synthesis",
            staged.reason,
            chairNow,
          );
          return;
        }
        await clearStageRecovery(options.database, runId, "chair_synthesis");
        return;
      }
      const reportPublicationNow = options.now?.() ?? new Date().toISOString();
      if (
        (await stageRecoveryState(
          options.database,
          runId,
          "report_publication",
          reportPublicationNow,
        )) !== "ready"
      )
        return;
      const accepted = await acceptedChair(options.database, runId);
      let published:
        | { readonly kind: "published" }
        | { readonly kind: "incomplete"; readonly reason?: string };
      try {
        published = await options.publishReport({
          runId,
          acceptedChairArtifactId: accepted.artifactId,
          fence: {
            jobId: accepted.jobId,
            attemptId: accepted.attemptId,
            ordinal: accepted.ordinal,
            ownerId: accepted.ownerId,
            token: accepted.token,
          },
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("editorial_quality_failed:")
        )
          published = { kind: "incomplete", reason: error.message };
        else {
          reportBlocked(
            "report_publication",
            error instanceof Error ? error.message : "runtime_error",
          );
          published = {
            kind: "incomplete",
            reason: "publication_runtime_error",
          };
        }
      }
      if (published.kind !== "published") {
        const reason = published.reason ?? "publication_incomplete";
        if (
          await terminalizeLegacyPublication(
            options.database,
            runId,
            reportPublicationNow,
          )
        )
          return;
        await recoverOrTerminalize(
          options.database,
          runId,
          "report_publication",
          reason,
          reportPublicationNow,
        );
        return;
      }
      await clearStageRecovery(options.database, runId, "report_publication");
    } finally {
      await chair.close();
      await semantic.close();
      await responses.close();
      await challenges.close();
      await departments.close();
    }
  };

  const advance = async (runId: string) => {
    const previous = runTails.get(runId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(
        async () =>
          await runWithResearchExecution(
            options.database,
            runId,
            async () => await advanceExclusive(runId),
          ),
      );
    runTails.set(runId, current);
    try {
      await current;
    } finally {
      if (runTails.get(runId) === current) runTails.delete(runId);
    }
  };

  return {
    advance,
    async resumeActiveRuns() {
      const database = options.database;
      const rows = (
        await database.query(
          "SELECT run_id FROM runs WHERE status = 'running' ORDER BY created_at",
          [],
        )
      ).rows as readonly { readonly run_id: string }[];
      for (const row of rows) await advance(row.run_id);
    },
  };
}

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { commitAgentOutput } from "../application/commitAgentOutput";
import { DepartmentConsolidationOutputSchema } from "../domain/agentOutputs";
import { hashCanonical } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
} from "../domain/ids";
import { CodexRunnerError } from "../server/codex/codexErrors";
import type { SafeCodexEvidence } from "../server/codex/codexTypes";
import { captureAttemptWebEvidence } from "../server/codex/codexWebCapture";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import type { AttemptHandler, WorkerAttempt } from "../worker/leaseEngine";
import { recordSuccessfulRunnerEvidence } from "./agentRunnerLaunchEvidence";
import type { SqliteDepartmentRoundOptions } from "./departmentRoundContracts";
import { inspectDepartmentCandidate } from "./departmentRoundOutput";
import type { DepartmentRoundSqliteAuthority } from "./departmentRoundSqliteAuthority";
import { retryRejectedCommit } from "./specialistCommitRetry";
import type { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

type HandlerContext = {
  readonly options: Pick<
    SqliteDepartmentRoundOptions,
    "attemptRoot" | "cas" | "codex" | "now"
  >;
  readonly workflowAuthority: SpecialistRoundSqliteAuthority;
  readonly departmentAuthority: DepartmentRoundSqliteAuthority;
  readonly commitStore: SqliteAgentOutputCommitStore;
};

function generatedIds() {
  return {
    artifactId: ArtifactIdSchema.parse(randomUUID()),
    eventId: EventIdSchema.parse(randomUUID()),
    replacementAttemptId: AttemptIdSchema.parse(randomUUID()),
    replacementEventId: EventIdSchema.parse(randomUUID()),
  };
}

export function createDepartmentRoundAttemptHandler(
  context: HandlerContext,
): AttemptHandler {
  const now = context.options.now ?? (() => new Date().toISOString());

  const execute = async (
    attempt: WorkerAttempt,
    signal: AbortSignal,
    activity: () => void,
  ): Promise<"accepted" | "commit_rejected" | "incomplete"> => {
    const logicalArtifactId =
      context.workflowAuthority.logicalArtifactForAttempt(attempt.attemptId);
    const job =
      logicalArtifactId === undefined
        ? undefined
        : context.departmentAuthority.loadJob(attempt.runId, logicalArtifactId);
    const claim = context.workflowAuthority.claimForAttempt(attempt.attemptId);
    if (job === undefined || claim === undefined) return "incomplete";
    const key = {
      runId: attempt.runId,
      jobId: attempt.jobId,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
    };
    let candidate: unknown;
    let runnerEvidence: SafeCodexEvidence;
    try {
      const attemptDir = join(context.options.attemptRoot, attempt.attemptId);
      mkdirSync(attemptDir, { recursive: true });
      const result = await context.options.codex.run({
        attemptDir,
        reservation: { key, fence: claim },
        stage: "department_consolidation",
        prompt: job.prompt,
        outputSchema: DepartmentConsolidationOutputSchema,
        captureWebEvidence: async (webEvidence) =>
          await captureAttemptWebEvidence(
            context.options.cas,
            context.commitStore,
            attempt.snapshotId,
            now(),
            webEvidence,
          ),
        signal,
        onActivity: activity,
      });
      candidate = inspectDepartmentCandidate(job, result.candidate) ?? {};
      runnerEvidence = result.evidence;
    } catch (error) {
      if (error instanceof CodexRunnerError) throw error;
      if (!(error instanceof Error)) throw error;
      return "incomplete";
    }
    const recorded = recordSuccessfulRunnerEvidence(
      context.commitStore,
      {
        runId: attempt.runId,
        jobId: attempt.jobId,
        attemptId: attempt.attemptId,
        ordinal: attempt.ordinal,
        ownerId: claim.ownerId,
        token: claim.token,
        now: now(),
        stage: "department_consolidation",
        promptHash: hashCanonical(job.prompt),
        inputHash: job.inputHash,
      },
      runnerEvidence,
    );
    if (!recorded) return "incomplete";
    const ids = generatedIds();
    const occurredAt = now();
    const committed = await retryRejectedCommit(
      async () =>
        await commitAgentOutput(
          { cas: context.options.cas, store: context.commitStore },
          {
            claim: { key, fence: claim },
            stage: "department_consolidation",
            candidate,
            ...ids,
            occurredAt,
          },
        ),
    );
    if (committed.kind === "committed" || committed.kind === "duplicate")
      return "accepted";
    if (committed.kind === "rejected") return "commit_rejected";
    if (committed.kind !== "replacement_reserved") return "incomplete";
    context.workflowAuthority.consumeReplacementBudget(attempt.runId);
    context.workflowAuthority.markReplacementRunning(ids.replacementAttemptId);
    return await execute(
      {
        ...attempt,
        attemptId: ids.replacementAttemptId,
        ordinal: committed.ordinal,
      },
      signal,
      activity,
    );
  };

  return {
    run: async (attempt, signal, activity) => {
      const outcome = await execute(attempt, signal, activity);
      if (outcome === "accepted") return { kind: "accepted" };
      return outcome === "commit_rejected"
        ? {
            kind: "transient",
            code: "department_consolidation_commit_rejected",
            retryAt: now(),
          }
        : { kind: "incomplete", code: "department_consolidation_missing" };
    },
  };
}

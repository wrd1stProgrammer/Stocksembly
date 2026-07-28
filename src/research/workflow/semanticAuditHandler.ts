import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ZodError } from "zod";
import { commitAgentOutput } from "../application/commitAgentOutput";
import { SemanticAuditOutputSchema } from "../domain/agentOutputs";
import { hashCanonical } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
} from "../domain/ids";
import { CodexRunnerError } from "../server/codex/codexErrors";
import type { SafeCodexEvidence } from "../server/codex/codexTypes";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import type { AttemptHandler, WorkerAttempt } from "../worker/leaseEngine";
import { recordSuccessfulRunnerEvidence } from "./agentRunnerLaunchEvidence";
import type { SemanticAuditSqliteAuthority } from "./semanticAuditAuthority";
import {
  SemanticAuditModelOutputSchema,
  SemanticAuditPromptSchema,
  type SqliteSemanticAuditOptions,
} from "./semanticAuditContracts";
import { retryRejectedCommit } from "./specialistCommitRetry";
import type { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

type Context = {
  readonly options: Pick<
    SqliteSemanticAuditOptions,
    "attemptRoot" | "cas" | "codex" | "now"
  >;
  readonly authority: SemanticAuditSqliteAuthority;
  readonly workflowAuthority: SpecialistRoundSqliteAuthority;
  readonly commitStore: SqliteAgentOutputCommitStore;
};
function validCandidate(promptJson: string, input: unknown): unknown {
  const prompt = SemanticAuditPromptSchema.parse(JSON.parse(promptJson));
  const parsed = SemanticAuditModelOutputSchema.safeParse(input);
  if (!parsed.success) return {};
  const verdicts = prompt.claims.map((claim) => {
    const received = parsed.data.verdicts.find(
      (item) => item.claimId === claim.claimId,
    );
    if (received === undefined) return undefined;
    return {
      ...received,
      contradictionSeverity:
        received.verdict === "contradicted"
          ? received.contradictionSeverity
          : ("none" as const),
      evidenceArtifactIds: [
        ...new Set(claim.evidence.map((slice) => slice.artifactId)),
      ],
    };
  });
  if (verdicts.some((verdict) => verdict === undefined)) return {};
  const claimIds = prompt.claims.map((claim) => claim.claimId);
  const questionCoverage = prompt.questions.map((question) => {
    const received = parsed.data.questionCoverage.find(
      (item) => item.questionId === question.questionId,
    );
    const coveredClaims =
      received?.claimIds.filter((claimId) => claimIds.includes(claimId)) ?? [];
    return {
      questionId: question.questionId,
      status: received?.status ?? ("uncovered" as const),
      claimIds: coveredClaims,
    };
  });
  return SemanticAuditOutputSchema.parse({
    kind: "semantic_audit",
    sourceArtifactIds: prompt.sourceArtifactIds,
    verdicts,
    questionCoverage,
  });
}

export function createSemanticAuditAttemptHandler(
  context: Context,
): AttemptHandler {
  const now = context.options.now ?? (() => new Date().toISOString());
  const execute = async (
    attempt: WorkerAttempt,
    signal: AbortSignal,
    activity: () => void,
  ): Promise<"accepted" | "commit_rejected" | "incomplete"> => {
    const job = context.authority.loadJob(attempt.runId);
    const claim = context.workflowAuthority.claimForAttempt(attempt.attemptId);
    if (job === undefined || claim === undefined) return "incomplete";
    const key = {
      runId: attempt.runId,
      jobId: attempt.jobId,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
    };
    let candidate: unknown = {};
    let runnerEvidence: SafeCodexEvidence;
    try {
      const attemptDir = join(context.options.attemptRoot, attempt.attemptId);
      mkdirSync(attemptDir, { recursive: true });
      const result = await context.options.codex.run({
        attemptDir,
        reservation: { key, fence: claim },
        stage: "semantic_audit",
        prompt: job.prompt,
        outputSchema: SemanticAuditModelOutputSchema,
        signal,
        onActivity: activity,
      });
      candidate = validCandidate(
        job.validationPrompt ?? job.prompt,
        result.candidate,
      );
      runnerEvidence = result.evidence;
    } catch (error) {
      if (error instanceof CodexRunnerError) throw error;
      if (error instanceof ZodError)
        throw new CodexRunnerError("output_invalid");
      if (error instanceof Error) throw new CodexRunnerError("process_failed");
      throw error;
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
        stage: "semantic_audit",
        promptHash: hashCanonical(job.prompt),
        inputHash: job.inputHash,
      },
      runnerEvidence,
    );
    if (!recorded) return "incomplete";
    const ids = {
      artifactId: ArtifactIdSchema.parse(randomUUID()),
      eventId: EventIdSchema.parse(randomUUID()),
      replacementAttemptId: AttemptIdSchema.parse(randomUUID()),
      replacementEventId: EventIdSchema.parse(randomUUID()),
    };
    const occurredAt = now();
    const committed = await retryRejectedCommit(
      async () =>
        await commitAgentOutput(
          { cas: context.options.cas, store: context.commitStore },
          {
            claim: { key, fence: claim },
            stage: "semantic_audit",
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
            code: "semantic_audit_commit_rejected",
            retryAt: now(),
          }
        : { kind: "incomplete", code: "semantic_audit_missing" };
    },
  };
}

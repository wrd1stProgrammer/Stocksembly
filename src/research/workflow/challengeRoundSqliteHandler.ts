import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { commitAgentOutput } from "../application/commitAgentOutput";
import { hashCanonical } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
} from "../domain/ids";
import { captureAttemptWebEvidence } from "../server/codex/codexWebCapture";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import type { AttemptHandler, WorkerAttempt } from "../worker/leaseEngine";
import { runAndRecordSuccessfulRunnerEvidence } from "./agentRunnerLaunchEvidence";
import type { SqliteChallengeRoundOptions } from "./challengeRoundContracts";
import { ChallengeDecisionSchema } from "./challengeRoundContracts";
import { inspectChallengeCandidate } from "./challengeRoundOutput";
import type { ChallengeRoundSqliteAuthority } from "./challengeRoundSqliteAuthority";
import { retryRejectedCommit } from "./specialistCommitRetry";
import type { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

type HandlerContext = {
  readonly options: Pick<
    SqliteChallengeRoundOptions,
    "attemptRoot" | "cas" | "codex" | "now"
  >;
  readonly workflowAuthority: SpecialistRoundSqliteAuthority;
  readonly challengeAuthority: ChallengeRoundSqliteAuthority;
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

export function createChallengeRoundAttemptHandler(
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
        : context.challengeAuthority.loadJob(attempt.runId, logicalArtifactId);
    const claim = context.workflowAuthority.claimForAttempt(attempt.attemptId);
    if (job === undefined || claim === undefined) return "incomplete";
    const key = {
      runId: attempt.runId,
      jobId: attempt.jobId,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
    };
    const attemptDir = join(context.options.attemptRoot, attempt.attemptId);
    mkdirSync(attemptDir, { recursive: true });
    const result = await runAndRecordSuccessfulRunnerEvidence(
      context.commitStore,
      {
        runId: attempt.runId,
        jobId: attempt.jobId,
        attemptId: attempt.attemptId,
        ordinal: attempt.ordinal,
        ownerId: claim.ownerId,
        token: claim.token,
        now: now(),
        stage: "blind_challenge",
        promptHash: hashCanonical(job.prompt),
        inputHash: job.inputHash,
      },
      async () =>
        await context.options.codex.run({
          attemptDir,
          reservation: { key, fence: claim },
          stage: "blind_challenge",
          prompt: job.prompt,
          outputSchema: ChallengeDecisionSchema,
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
        }),
    );
    if (result === undefined) return "incomplete";
    const candidate = inspectChallengeCandidate(job, result.candidate) ?? {};
    const ids = generatedIds();
    const occurredAt = now();
    const committed = await retryRejectedCommit(
      async () =>
        await commitAgentOutput(
          { cas: context.options.cas, store: context.commitStore },
          {
            claim: { key, fence: claim },
            stage: "blind_challenge",
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
            code: "blind_challenge_commit_rejected",
            retryAt: now(),
          }
        : { kind: "incomplete", code: "blind_challenge_missing" };
    },
  };
}

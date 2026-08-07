import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { commitAgentOutput } from "../application/commitAgentOutput";
import {
  FollowUpOutputSchema,
  OwnerResponseBallotOutputSchema,
} from "../domain/agentOutputs";
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
import type { FollowupAndResponseRoundOptions } from "./followupAndResponseRoundContracts";
import {
  inspectFollowupCandidate,
  inspectOwnerResponseCandidate,
} from "./followupAndResponseRoundOutput";
import type { FollowupAndResponseRoundSqliteAuthority } from "./followupAndResponseRoundSqliteAuthority";
import { retryRejectedCommit } from "./specialistCommitRetry";
import type { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

type HandlerContext = {
  readonly options: Pick<
    FollowupAndResponseRoundOptions,
    "attemptRoot" | "cas" | "codex" | "now"
  >;
  readonly workflowAuthority: SpecialistRoundSqliteAuthority;
  readonly roundAuthority: FollowupAndResponseRoundSqliteAuthority;
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

export function createFollowupAndResponseAttemptHandler(
  context: HandlerContext,
): AttemptHandler {
  const now = context.options.now ?? (() => new Date().toISOString());
  const execute = async (
    attempt: WorkerAttempt,
    signal: AbortSignal,
    activity: () => void,
  ): Promise<"accepted" | "degraded" | "incomplete" | "repair"> => {
    const logicalArtifactId =
      context.workflowAuthority.logicalArtifactForAttempt(attempt.attemptId);
    const job =
      logicalArtifactId === undefined
        ? undefined
        : context.roundAuthority.loadJob(attempt.runId, logicalArtifactId);
    const claim = context.workflowAuthority.claimForAttempt(attempt.attemptId);
    if (job === undefined || claim === undefined) return "incomplete";
    const key = {
      runId: attempt.runId,
      jobId: attempt.jobId,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
    };
    let raw: unknown;
    let runnerEvidence: SafeCodexEvidence;
    try {
      const attemptDir = join(context.options.attemptRoot, attempt.attemptId);
      mkdirSync(attemptDir, { recursive: true });
      const result =
        job.stage === "follow_up"
          ? await context.options.codex.run({
              attemptDir,
              reservation: { key, fence: claim },
              stage: "follow_up",
              prompt: job.prompt,
              outputSchema: FollowUpOutputSchema,
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
            })
          : await context.options.codex.run({
              attemptDir,
              reservation: { key, fence: claim },
              stage: "owner_response_ballot",
              prompt: job.prompt,
              outputSchema: OwnerResponseBallotOutputSchema,
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
      raw = result.candidate;
      runnerEvidence = result.evidence;
    } catch (error) {
      if (error instanceof CodexRunnerError) throw error;
      if (!(error instanceof Error)) throw error;
      return job.stage === "follow_up" ? "degraded" : "repair";
    }
    const candidate =
      job.stage === "follow_up"
        ? inspectFollowupCandidate(job, raw)
        : inspectOwnerResponseCandidate(job, raw);
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
        stage: job.stage,
        promptHash: hashCanonical(job.prompt),
        inputHash: job.inputHash,
      },
      runnerEvidence,
    );
    if (!recorded) return "incomplete";
    if (candidate === undefined && job.stage === "follow_up") return "degraded";
    const ids = generatedIds();
    const occurredAt = now();
    const committed = await retryRejectedCommit(
      async () =>
        await commitAgentOutput(
          { cas: context.options.cas, store: context.commitStore },
          {
            claim: { key, fence: claim },
            stage: job.stage,
            candidate: candidate ?? {},
            ...ids,
            occurredAt,
          },
        ),
    );
    if (committed.kind === "committed" || committed.kind === "duplicate")
      return "accepted";
    if (committed.kind === "rejected")
      return job.stage === "follow_up" ? "degraded" : "repair";
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
      if (outcome === "degraded")
        return {
          kind: "degraded",
          code: "optional_followup_unavailable",
        };
      return outcome === "repair"
        ? {
            kind: "repair",
            code: "owner_response_invalid_after_retry",
            retryAt: now(),
          }
        : {
            kind: "repair",
            code: "followup_or_owner_response_missing",
            retryAt: now(),
          };
    },
  };
}

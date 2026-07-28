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
import { CodexRunnerError } from "../server/codex/codexErrors";
import type { SafeCodexEvidence } from "../server/codex/codexTypes";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import type { AttemptHandler, WorkerAttempt } from "../worker/leaseEngine";
import { recordSuccessfulRunnerEvidence } from "./agentRunnerLaunchEvidence";
import type { ChairSynthesisSqliteAuthority } from "./chairSynthesisAuthority";
import {
  ChairSynthesisModelOutputSchema,
  type SqliteChairSynthesisOptions,
} from "./chairSynthesisContracts";
import {
  repairChairCandidate,
  validChairCandidate,
} from "./chairSynthesisValidation";
import { retryRejectedCommit } from "./specialistCommitRetry";
import type { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";

type Context = {
  readonly options: Pick<
    SqliteChairSynthesisOptions,
    "attemptRoot" | "cas" | "codex" | "now" | "publishReport"
  >;
  readonly authority: ChairSynthesisSqliteAuthority;
  readonly workflowAuthority: SpecialistRoundSqliteAuthority;
  readonly commitStore: SqliteAgentOutputCommitStore;
};

export { validChairCandidate } from "./chairSynthesisValidation";

export function createChairSynthesisAttemptHandler(
  context: Context,
): AttemptHandler {
  const now = context.options.now ?? (() => new Date().toISOString());
  const incompleteCodes = new Map<string, string>();
  const execute = async (
    attempt: WorkerAttempt,
    signal: AbortSignal,
    activity: () => void,
    repairInvalidSections = false,
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
        stage: "chair_synthesis",
        prompt: job.prompt,
        outputSchema: ChairSynthesisModelOutputSchema,
        signal,
        onActivity: activity,
      });
      const validationPrompt = job.validationPrompt ?? job.prompt;
      candidate = repairInvalidSections
        ? repairChairCandidate(validationPrompt, result.candidate)
        : validChairCandidate(validationPrompt, result.candidate);
      runnerEvidence = result.evidence;
    } catch (error) {
      if (error instanceof CodexRunnerError) throw error;
      if (!(error instanceof Error)) throw error;
      return "incomplete";
    }
    const recorded = recordSuccessfulRunnerEvidence(
      context.commitStore,
      {
        ...key,
        ownerId: claim.ownerId,
        token: claim.token,
        now: now(),
        stage: "chair_synthesis",
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
            stage: "chair_synthesis",
            candidate,
            ...ids,
            occurredAt,
          },
        ),
    );
    if (committed.kind === "committed" || committed.kind === "duplicate") {
      if (context.options.publishReport === undefined) return "accepted";
      const acceptedChairArtifactId =
        committed.kind === "committed"
          ? ids.artifactId
          : context.authority.acceptedArtifactId(attempt.runId);
      if (acceptedChairArtifactId === undefined) return "incomplete";
      const published = await context.options.publishReport({
        runId: attempt.runId,
        acceptedChairArtifactId,
        fence: {
          jobId: attempt.jobId,
          attemptId: attempt.attemptId,
          ordinal: attempt.ordinal,
          ownerId: claim.ownerId,
          token: claim.token,
        },
      });
      if (published.kind !== "published")
        incompleteCodes.set(
          attempt.runId,
          `report_publication_failed:${published.reason ?? "unknown"}`,
        );
      return published.kind === "published" ? "accepted" : "incomplete";
    }
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
      true,
    );
  };
  return {
    run: async (attempt, signal, activity) => {
      const outcome = await execute(attempt, signal, activity);
      const code =
        incompleteCodes.get(attempt.runId) ?? "chair_synthesis_missing";
      incompleteCodes.delete(attempt.runId);
      if (outcome === "accepted") return { kind: "accepted" };
      return outcome === "commit_rejected"
        ? {
            kind: "transient",
            code: "chair_synthesis_commit_rejected",
            retryAt: now(),
          }
        : { kind: "incomplete", code };
    },
  };
}

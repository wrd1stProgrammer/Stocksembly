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
import { codexInputHash } from "../server/codex/codexReservation";
import type { SafeCodexEvidence } from "../server/codex/codexTypes";
import { CodexIsolationError } from "../server/codex/readiness";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import type { AttemptHandler, WorkerAttempt } from "../worker/leaseEngine";
import { recordSuccessfulRunnerEvidence } from "./agentRunnerLaunchEvidence";
import type { ChairSynthesisSqliteAuthority } from "./chairSynthesisAuthority";
import {
  ChairSectionRewriteSchema,
  ChairSynthesisModelOutputSchema,
  ChairSynthesisPromptSchema,
  type SqliteChairSynthesisOptions,
} from "./chairSynthesisContracts";
import { chairSectionRewritePrompt } from "./chairSynthesisPrompts";
import {
  type ChairCandidateIssue,
  chairCandidateIssue,
  nextChairSectionRewrite,
  projectChairAssignments,
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
  type RewriteContext = {
    readonly originalCandidate: unknown;
    readonly issue: ChairCandidateIssue;
  };
  const execute = async (
    attempt: WorkerAttempt,
    signal: AbortSignal,
    activity: () => void,
    rewrite?: RewriteContext,
  ): Promise<
    | "accepted"
    | "commit_rejected"
    | "incomplete"
    | {
        readonly kind: "isolation_unavailable";
        readonly check: CodexIsolationError["check"];
        readonly reason: CodexIsolationError["reason"];
      }
  > => {
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
    let nextRewrite = rewrite;
    let runnerEvidence: SafeCodexEvidence;
    let runnerPrompt = job.prompt;
    try {
      const attemptDir = join(context.options.attemptRoot, attempt.attemptId);
      mkdirSync(attemptDir, { recursive: true });
      const validationPrompt = job.validationPrompt ?? job.prompt;
      const prompt = ChairSynthesisPromptSchema.parse(
        JSON.parse(validationPrompt),
      );
      const original =
        rewrite === undefined
          ? undefined
          : ChairSynthesisModelOutputSchema.safeParse(
              rewrite.originalCandidate,
            );
      const excludedSentenceIds =
        original?.success === true
          ? original.data.sections
              .filter(
                (section) => section.sectionKey !== rewrite?.issue.sectionKey,
              )
              .flatMap((section) => section.sentenceIds)
          : [];
      const originalSection =
        original?.success === true
          ? original.data.sections.find(
              (section) => section.sectionKey === rewrite?.issue.sectionKey,
            )
          : undefined;
      runnerPrompt =
        rewrite === undefined
          ? job.prompt
          : chairSectionRewritePrompt({
              prompt,
              sectionKey: rewrite.issue.sectionKey,
              reason: rewrite.issue.reason,
              excludedSentenceIds,
              ...(originalSection === undefined ? {} : { originalSection }),
            });
      if (
        rewrite !== undefined &&
        !context.workflowAuthority.rebindReplacementInput(
          attempt.attemptId,
          codexInputHash({
            stage: "chair_synthesis",
            prompt: runnerPrompt,
            outputSchema: ChairSectionRewriteSchema,
          }),
        )
      )
        return "incomplete";
      const result =
        rewrite === undefined
          ? await context.options.codex.run({
              attemptDir,
              reservation: { key, fence: claim },
              stage: "chair_synthesis",
              prompt: runnerPrompt,
              outputSchema: ChairSynthesisModelOutputSchema,
              signal,
              onActivity: activity,
            })
          : await context.options.codex.run({
              attemptDir,
              reservation: { key, fence: claim },
              stage: "chair_synthesis",
              prompt: runnerPrompt,
              outputSchema: ChairSectionRewriteSchema,
              signal,
              onActivity: activity,
            });
      const projection =
        rewrite === undefined
          ? projectChairAssignments(validationPrompt, result.candidate)
          : undefined;
      candidate =
        rewrite === undefined
          ? projection === undefined
            ? {}
            : validChairCandidate(validationPrompt, projection.candidate)
          : repairChairCandidate(
              validationPrompt,
              rewrite.originalCandidate,
              result.candidate,
            );
      const subsequentRewrite =
        rewrite === undefined
          ? undefined
          : nextChairSectionRewrite(
              validationPrompt,
              rewrite.originalCandidate,
              result.candidate,
            );
      if (
        projection !== undefined &&
        typeof candidate === "object" &&
        candidate !== null &&
        Object.keys(candidate).length > 0
      )
        process.stdout.write(
          `${JSON.stringify({
            kind: "chair_assignment_projected",
            attemptId: attempt.attemptId,
            projectionHash: projection.projectionHash,
            canonicalCandidateHash: hashCanonical(candidate),
          })}\n`,
        );
      if (
        rewrite !== undefined &&
        typeof candidate === "object" &&
        candidate !== null &&
        Object.keys(candidate).length === 0
      ) {
        incompleteCodes.set(
          attempt.runId,
          `chair_targeted_rewrite_failed:${subsequentRewrite?.issue.reason ?? rewrite.issue.reason}`,
        );
        if (subsequentRewrite !== undefined) nextRewrite = subsequentRewrite;
      }
      if (rewrite === undefined)
        nextRewrite = {
          originalCandidate: projection?.candidate ?? result.candidate,
          issue: chairCandidateIssue(
            validationPrompt,
            projection?.candidate ?? result.candidate,
          ) ?? {
            sectionKey: "ten_second_brief",
            reason: "invalid_model_output",
          },
        };
      runnerEvidence = result.evidence;
    } catch (error) {
      if (error instanceof CodexRunnerError) throw error;
      if (!(error instanceof Error)) throw error;
      if (error instanceof CodexIsolationError)
        return {
          kind: "isolation_unavailable",
          check: error.check,
          reason: error.reason,
        };
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
        promptHash: hashCanonical(runnerPrompt),
        inputHash:
          context.workflowAuthority.inputHashForAttempt(attempt.attemptId) ??
          job.inputHash,
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
      let published:
        | { readonly kind: "published" }
        | { readonly kind: "incomplete"; readonly reason?: string };
      try {
        published = await context.options.publishReport({
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
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("editorial_quality_failed:")
        ) {
          incompleteCodes.set(attempt.runId, error.message);
          return "incomplete";
        }
        throw error;
      }
      if (published.kind !== "published")
        incompleteCodes.set(
          attempt.runId,
          published.reason?.startsWith("editorial_quality_failed:")
            ? published.reason
            : `report_publication_failed:${published.reason ?? "unknown"}`,
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
      nextRewrite,
    );
  };
  return {
    run: async (attempt, signal, activity) => {
      const outcome = await execute(attempt, signal, activity);
      const code =
        incompleteCodes.get(attempt.runId) ?? "chair_synthesis_missing";
      incompleteCodes.delete(attempt.runId);
      if (outcome === "accepted") return { kind: "accepted" };
      if (
        typeof outcome === "object" &&
        outcome.kind === "isolation_unavailable"
      )
        return {
          kind: "transient",
          code: "codex_isolation_temporarily_unavailable",
          retryAt: now(),
          readiness: { check: outcome.check, reason: outcome.reason },
        };
      return outcome === "commit_rejected"
        ? {
            kind: "transient",
            code: "chair_synthesis_commit_rejected",
            retryAt: now(),
          }
        : { kind: "repair", code, retryAt: now() };
    },
  };
}

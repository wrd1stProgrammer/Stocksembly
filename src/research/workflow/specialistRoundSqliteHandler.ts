import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitAgentOutput } from "../application/commitAgentOutput";
import { MemoOutputSchema } from "../domain/agentOutputs";
import { hashCanonical } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
} from "../domain/ids";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { CodexRunnerError } from "../server/codex/codexErrors";
import {
  researchRuntimeOverride,
  trustedResearchRuntime,
} from "../server/codex/codexPolicy";
import type { SafeCodexEvidence } from "../server/codex/codexTypes";
import { captureAttemptWebEvidence } from "../server/codex/codexWebCapture";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import type { AttemptHandler, WorkerAttempt } from "../worker/leaseEngine";
import { recordSuccessfulRunnerEvidence } from "./agentRunnerLaunchEvidence";
import { retryRejectedCommit } from "./specialistCommitRetry";
import type { SpecialistRoundSqliteAuthority } from "./specialistRoundSqliteAuthority";
import type {
  PersistedSpecialistJob,
  SqliteSpecialistRoundOptions,
} from "./specialistRoundSqliteContracts";

type HandlerContext = {
  readonly options: Pick<
    SqliteSpecialistRoundOptions,
    "attemptRoot" | "cas" | "codex" | "now"
  >;
  readonly authority: SpecialistRoundSqliteAuthority;
  readonly commitStore: SqliteAgentOutputCommitStore;
};

type CitationCorrection = {
  readonly invalidArtifactIds: readonly string[];
  readonly allowedArtifactIds: readonly string[];
};

type ExecuteOutcome =
  | "accepted"
  | "commit_rejected"
  | "incomplete"
  | "citation_invalid_after_retry";

function correctivePrompt(
  prompt: string,
  correction: CitationCorrection | undefined,
): string {
  if (correction === undefined) return prompt;
  return `${prompt}

CORRECTIVE RETRY — INVALID CITATION IDS
Your previous output cited artifact IDs that were not supplied to this attempt:
${correction.invalidArtifactIds.join("\n")}

Cite only artifact IDs from this allowlist:
${correction.allowedArtifactIds.join("\n")}

Do not invent, transform, or copy any other artifact ID. Rebuild the memo using only the available evidence.`;
}

function generatedIds() {
  return {
    artifactId: ArtifactIdSchema.parse(randomUUID()),
    eventId: EventIdSchema.parse(randomUUID()),
    replacementAttemptId: AttemptIdSchema.parse(randomUUID()),
    replacementEventId: EventIdSchema.parse(randomUUID()),
  };
}

function attemptRole(
  attempt: WorkerAttempt,
  authority: SpecialistRoundSqliteAuthority,
): string {
  const replay = authority.replay(attempt.runId);
  return (
    replay.receipts.find((receipt) => receipt.attemptId === attempt.attemptId)
      ?.roleId ?? ""
  );
}

export function createSpecialistRoundAttemptHandler(
  context: HandlerContext,
): AttemptHandler {
  const now = context.options.now ?? (() => new Date().toISOString());

  const recordEvidence = (
    attempt: WorkerAttempt,
    claim: { readonly ownerId: string; readonly token: number },
    job: PersistedSpecialistJob,
    prompt: string,
    evidence: SafeCodexEvidence,
  ): boolean =>
    recordSuccessfulRunnerEvidence(
      context.commitStore,
      {
        runId: attempt.runId,
        jobId: attempt.jobId,
        attemptId: attempt.attemptId,
        ordinal: attempt.ordinal,
        ownerId: claim.ownerId,
        token: claim.token,
        now: now(),
        stage: "memo",
        expectedRuntime: trustedResearchRuntime(
          "memo",
          job.logicalArtifactId,
          process.env["STOCKSEMBLY_LUNA_SUPPORT_SPECIALISTS"] === "1",
        ),
        promptHash: hashCanonical(prompt),
        inputHash: job.inputHash,
      },
      evidence,
    );

  const execute = async (
    attempt: WorkerAttempt,
    signal: AbortSignal,
    activity: () => void,
    correction?: CitationCorrection,
  ): Promise<ExecuteOutcome> => {
    const job = context.authority.loadJob(
      attempt.runId,
      `memo:${attemptRole(attempt, context.authority)}`,
    );
    const claim = context.authority.claimForAttempt(attempt.attemptId);
    if (job === undefined || claim === undefined) return "incomplete";
    const key = {
      runId: attempt.runId,
      jobId: attempt.jobId,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
    };
    let candidate: unknown;
    let runnerEvidence: SafeCodexEvidence;
    const prompt = correctivePrompt(job.prompt, correction);
    try {
      const attemptDir = join(context.options.attemptRoot, attempt.attemptId);
      mkdirSync(attemptDir, { recursive: true });
      const evidenceDirectory = join(attemptDir, "evidence");
      mkdirSync(evidenceDirectory, { recursive: true });
      for (const source of context.authority.sourceArtifactsForJob(job.jobId)) {
        const artifact = await context.options.cas.get(
          ArtifactDigestSchema.parse(source.contentHash),
        );
        if (artifact === undefined)
          throw new TypeError(
            `source artifact ${source.artifactId} is missing`,
          );
        const relativePath = `evidence/${source.artifactId}.json`;
        writeFileSync(join(attemptDir, relativePath), artifact.bytes);
      }
      const runtime = researchRuntimeOverride("memo", job.logicalArtifactId);
      const result = await context.options.codex.run({
        attemptDir,
        reservation: { key, fence: claim },
        stage: "memo",
        ...(runtime === undefined ? {} : { runtime }),
        prompt,
        outputSchema: MemoOutputSchema,
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
      candidate = result.candidate;
      writeFileSync(
        join(attemptDir, "candidate.json"),
        JSON.stringify(result.candidate, null, 2),
      );
      runnerEvidence = result.evidence;
    } catch (error) {
      if (error instanceof CodexRunnerError) throw error;
      if (!(error instanceof Error)) throw error;
      writeFileSync(
        join(context.options.attemptRoot, attempt.attemptId, "error.txt"),
        `${error.name}: ${error.message}\n`,
      );
      return "incomplete";
    }
    if (!recordEvidence(attempt, claim, job, prompt, runnerEvidence))
      return "incomplete";
    const ids = generatedIds();
    const occurredAt = now();
    const committed = await retryRejectedCommit(
      async () =>
        await commitAgentOutput(
          { cas: context.options.cas, store: context.commitStore },
          {
            claim: { key, fence: claim },
            stage: "memo",
            candidate,
            ...ids,
            occurredAt,
          },
        ),
    );
    if (committed.kind === "committed" || committed.kind === "duplicate")
      return "accepted";
    if (committed.kind === "rejected") return "commit_rejected";
    if (committed.kind === "citation_incomplete")
      return "citation_invalid_after_retry";
    if (committed.kind === "citation_replacement_reserved") {
      context.authority.consumeReplacementBudget(attempt.runId);
      context.authority.markReplacementRunning(ids.replacementAttemptId);
      return await execute(
        {
          ...attempt,
          attemptId: ids.replacementAttemptId,
          ordinal: committed.ordinal,
        },
        signal,
        activity,
        {
          invalidArtifactIds: committed.invalidArtifactIds,
          allowedArtifactIds: committed.allowedArtifactIds,
        },
      );
    }
    if (committed.kind !== "replacement_reserved") return "incomplete";
    context.authority.consumeReplacementBudget(attempt.runId);
    context.authority.markReplacementRunning(ids.replacementAttemptId);
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
      if (outcome === "commit_rejected")
        return {
          kind: "transient",
          code: "specialist_commit_rejected",
          retryAt: now(),
        };
      return {
        kind: "incomplete",
        code:
          outcome === "citation_invalid_after_retry"
            ? "specialist_citation_invalid_after_retry"
            : "specialist_memo_missing",
      };
    },
  };
}

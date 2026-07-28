import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { hashCanonical } from "../../domain/contractHelpers";
import { GroundedAnswerSchema } from "../../domain/question";
import {
  questionExternalApiEvidence,
  questionLookupPlan,
} from "../../domain/questionLookupPlan";
import type { ArtifactCasPort } from "../../ports/artifacts";
import type { AttemptHandler } from "../../worker/leaseEngine";
import type { SpecialistRoundSqliteAuthority } from "../../workflow/specialistRoundSqliteAuthority";
import type { CodexPort } from "../codex/codexRunner";
import { CodexRunnerError } from "../codex/codexRunner";
import type { CapturedWebArtifact } from "../codex/codexTypes";
import { captureAttemptWebEvidence } from "../codex/codexWebCapture";
import type { SqliteAgentOutputCommitStore } from "../persistence/sqlite/sqliteAgentOutputCommitStore";
import {
  groundedClaims,
  QuestionSelectionSchema,
  questionInputHash,
  questionPrompt,
  questionRuntimeOverride,
} from "./questionAnswerContracts";
import type { QuestionAnswerSqliteAuthority } from "./questionAnswerSqliteAuthority";
import { collectQuestionWebEvidence } from "./questionWebEvidence";

export type QuestionAnswerHandlerOptions = {
  readonly attemptRoot: string;
  readonly cas: ArtifactCasPort;
  readonly codex: CodexPort;
  readonly commitStore: SqliteAgentOutputCommitStore;
  readonly reservations: SpecialistRoundSqliteAuthority;
  readonly questions: QuestionAnswerSqliteAuthority;
  readonly now?: () => string;
};

export function createQuestionAnswerHandler(
  options: QuestionAnswerHandlerOptions,
): AttemptHandler {
  return {
    run: async (attempt, signal, activity) => {
      if (attempt.kind !== "qa")
        return { kind: "permanent", code: "question_job_required" };
      const context = await options.questions.load(attempt.attemptId);
      const claim = options.reservations.claimForAttempt(attempt.attemptId);
      if (context === undefined || claim === undefined)
        return { kind: "permanent", code: "question_context_unavailable" };
      const prompt = questionPrompt(
        context.report,
        context.questionId,
        context.question,
      );
      if (
        questionInputHash(
          context.report,
          context.questionId,
          context.question,
        ) !== context.inputHash
      )
        return { kind: "permanent", code: "question_input_changed" };
      mkdirSync(join(options.attemptRoot, attempt.attemptId), {
        recursive: true,
      });
      const lookupPlan = questionLookupPlan(context.question);
      const apiEvidence = questionExternalApiEvidence(context.question);
      const runtime = questionRuntimeOverride(context.question);
      let capturedWebEvidence: readonly CapturedWebArtifact[] = [];
      try {
        const result = await options.codex.run({
          attemptDir: join(options.attemptRoot, attempt.attemptId),
          reservation: {
            key: {
              runId: attempt.runId,
              jobId: attempt.jobId,
              attemptId: attempt.attemptId,
              ordinal: attempt.ordinal,
            },
            fence: claim,
          },
          stage: "qa",
          ...(runtime === undefined ? {} : { runtime }),
          prompt,
          outputSchema: QuestionSelectionSchema,
          ...(lookupPlan.mode === "external"
            ? {
                captureWebEvidence: async (webEvidence) => {
                  capturedWebEvidence = webEvidence.artifacts;
                  return await captureAttemptWebEvidence(
                    options.cas,
                    options.commitStore,
                    attempt.snapshotId,
                    (options.now ?? (() => new Date().toISOString()))(),
                    webEvidence,
                  );
                },
              }
            : {}),
          signal,
          onActivity: activity,
        });
        if (
          lookupPlan.mode === "report_only" &&
          (result.evidence.toolEventCount > 0 ||
            result.candidate.externalUrls.length > 0)
        )
          return {
            kind: "permanent",
            code: "question_unexpected_external_lookup",
          };
        const apiUrls = new Set(apiEvidence.map((source) => source.url));
        const matchedApiUrls = result.candidate.externalUrls.filter((url) =>
          apiUrls.has(url),
        );
        const selectedExternalUrls =
          result.evidence.toolEventCount === 0 && apiEvidence.length > 0
            ? matchedApiUrls.length > 0
              ? matchedApiUrls
              : apiEvidence.slice(0, 1).map((source) => source.url)
            : result.candidate.externalUrls;
        const capturedUrls = new Set(capturedWebEvidence.map(({ url }) => url));
        const uncapturedUrls = selectedExternalUrls.filter(
          (url) =>
            !capturedUrls.has(url) &&
            !apiEvidence.some((source) => source.url === url),
        );
        if (uncapturedUrls.length > 0) {
          if (result.evidence.toolEventCount === 0)
            return {
              kind: "permanent",
              code: "question_external_source_not_captured",
            };
          try {
            const fetched = await Promise.all(
              uncapturedUrls.map((url) => collectQuestionWebEvidence(url)),
            );
            const persisted = await captureAttemptWebEvidence(
              options.cas,
              options.commitStore,
              attempt.snapshotId,
              (options.now ?? (() => new Date().toISOString()))(),
              {
                reservation: {
                  key: {
                    runId: attempt.runId,
                    jobId: attempt.jobId,
                    attemptId: attempt.attemptId,
                    ordinal: attempt.ordinal,
                  },
                  fence: claim,
                },
                transcriptHash: result.evidence.toolTranscriptHash,
                artifacts: fetched,
              },
            );
            if (!persisted)
              return {
                kind: "permanent",
                code: "question_external_source_not_captured",
              };
            capturedWebEvidence = [...capturedWebEvidence, ...fetched];
          } catch (error) {
            if (!(error instanceof TypeError)) throw error;
            return {
              kind: "permanent",
              code: "question_external_source_not_captured",
            };
          }
        }
        const claims = new Map(
          groundedClaims(context.report).map((item) => [item.claimId, item]),
        );
        const selected = result.candidate.claimIds.map((claimId) =>
          claims.get(claimId),
        );
        if (selected.some((item) => item === undefined))
          return { kind: "permanent", code: "question_claim_not_published" };
        const availableExternalSources = new Map(
          [
            ...apiEvidence,
            ...capturedWebEvidence.map((source) => ({
              url: source.url,
              title: source.title,
              publisher: source.publisher,
              retrievedAt: source.retrievedAt,
              excerpt: source.excerpt,
            })),
          ].map((source) => [source.url, source] as const),
        );
        const externalSources = selectedExternalUrls.map((url) =>
          availableExternalSources.get(url),
        );
        if (externalSources.some((source) => source === undefined))
          return {
            kind: "permanent",
            code: "question_external_source_not_captured",
          };
        if (lookupPlan.mode === "external" && externalSources.length === 0)
          return {
            kind: "permanent",
            code: "question_external_evidence_missing",
          };
        const answer = GroundedAnswerSchema.parse({
          summary: result.candidate.answer,
          elements: selected.map((item) => ({
            claimId: item?.claimId,
            sourceIds: item?.sourceIds,
            text: item?.text,
          })),
          externalSources,
        });
        return {
          kind: "accepted",
          qa: {
            answer,
            reportId: context.reportId,
            reportVersionId: context.reportVersionId,
            reportArtifactId: context.reportArtifactId,
            reportArtifactDigest: context.reportArtifactDigest,
            inputHash: context.inputHash,
            promptHash: hashCanonical(prompt),
            schemaHash: result.evidence.schemaHash,
            binaryHash: result.evidence.binaryHash,
            cliVersion: result.evidence.binaryVersion,
          },
        };
      } catch (error) {
        if (
          error instanceof CodexRunnerError &&
          (error.code === "timeout" || error.code === "inactivity_timeout")
        )
          return { kind: "permanent", code: "question_timeout" };
        if (error instanceof CodexRunnerError) throw error;
        throw error;
      }
    },
  };
}

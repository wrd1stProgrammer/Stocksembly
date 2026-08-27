import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitAgentOutput } from "../application/commitAgentOutput";
import { hashCanonical } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
} from "../domain/ids";
import { workflowRoleById } from "../domain/roleRegistry";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { CodexRunnerError } from "../server/codex/codexErrors";
import {
  researchRuntimeOverride,
  trustedResearchRuntime,
} from "../server/codex/codexPolicy";
import { codexInputHash } from "../server/codex/codexReservation";
import type { SafeCodexEvidence } from "../server/codex/codexTypes";
import { captureAttemptWebEvidence } from "../server/codex/codexWebCapture";
import { CodexIsolationError } from "../server/codex/readiness";
import type { SqliteAgentOutputCommitStore } from "../server/persistence/sqlite/sqliteAgentOutputCommitStore";
import type { AttemptHandler, WorkerAttempt } from "../worker/leaseEngine";
import { recordSuccessfulRunnerEvidence } from "./agentRunnerLaunchEvidence";
import { retryRejectedCommit } from "./specialistCommitRetry";
import type { SpecialistJobRequest } from "./specialistRoundContracts";
import { SpecialistMemoOutputSchema } from "./specialistRoundContracts";
import {
  normalizeSpecialistClaimSlotBindings,
  type SpecialistClaimValidationReason,
  sanitizeSpecialistDecisiveMetricIds,
  sanitizeSpecialistEvidenceTypeBindings,
  sanitizeSpecialistNumericMetricValues,
  specialistThesisFingerprints,
  validateSpecialistClaimSubmission,
} from "./specialistRoundInput";
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
  | {
      readonly kind: "isolation_unavailable";
      readonly check: CodexIsolationError["check"];
      readonly reason: CodexIsolationError["reason"];
    }
  | "incomplete"
  | "citation_invalid_after_retry"
  | SpecialistClaimValidationReason;

export function isSpecialistAttemptReadableSource(
  job: Pick<PersistedSpecialistJob, "comparatorQualification">,
  artifactId: string,
): boolean {
  const rawPeerArtifactId =
    job.comparatorQualification.status === "available"
      ? job.comparatorQualification.qualification.rawPeerArtifactId
      : job.comparatorQualification.rawPeerArtifactId;
  return rawPeerArtifactId !== artifactId;
}

function correctivePrompt(
  prompt: string,
  correction: CitationCorrection | undefined,
  validationCode?: string,
): string {
  const validationPrompt = specialistValidationCorrectivePrompt(
    prompt,
    validationCode,
  );
  if (correction === undefined) return validationPrompt;
  return `${validationPrompt}

CORRECTIVE RETRY — INVALID CITATION IDS
Your previous output cited artifact IDs that were not supplied to this attempt:
${correction.invalidArtifactIds.join("\n")}

Cite only artifact IDs from this allowlist:
${correction.allowedArtifactIds.join("\n")}

Do not cite or convert contentHash, rawHash, or normalizedHash values. Do not invent, transform, or copy any other artifact ID. Rebuild the memo using only the available evidence.`;
}

export function specialistValidationCorrectivePrompt(
  prompt: string,
  validationCode?: string,
): string {
  if (validationCode === "specialist_claim_numeric_metric_mismatch")
    return `${prompt}

CORRECTIVE RETRY — NUMERIC GROUNDING
Your previous publicSummary used one or more percentages without binding each percentage to an exact registered metric for the same concept and period.
For every percentage in publicSummary, copy the matching request.registeredValues[].valueId into that claim's decisiveMetricIds. If no exact matching registered value exists for the same metric and period, omit the percentage and state the directional observation without a number. Do not calculate or infer a replacement percentage.`;
  if (validationCode === "specialist_claim_evidence_type_mismatch")
    return `${prompt}

CORRECTIVE RETRY — EVIDENCE TYPE
Your previous non-ownership claim cited an insider ownership filing. Forms 3, 4, and 5 may be cited only for an explicit insider transaction or ownership claim.
For revenue, margin, cash flow, valuation, competition, demand, or price-performance claims, remove every Form 3/4/5 citation and cite the supplied 10-K, 10-Q, 8-K, market, or licensed-provider artifact that directly supports the claim. If no suitable artifact exists, rewrite the claim without that assertion.`;
  return prompt;
}

const SPECIALIST_VALIDATION_REPAIR_CODES = [
  "specialist_claim_numeric_metric_mismatch",
  "specialist_claim_evidence_type_mismatch",
] as const;

export function specialistPromptForDurableInput(
  basePrompt: string,
  inputHash: string,
  requestedValidationCode?: string,
): { readonly prompt: string; readonly validationCode?: string } {
  for (const validationCode of SPECIALIST_VALIDATION_REPAIR_CODES) {
    const prompt = specialistValidationCorrectivePrompt(
      basePrompt,
      validationCode,
    );
    if (
      codexInputHash({
        stage: "memo",
        prompt,
        outputSchema: SpecialistMemoOutputSchema,
      }) === inputHash
    )
      return { prompt, validationCode };
  }
  if (
    requestedValidationCode !== undefined &&
    requestedValidationCode.startsWith("specialist_claim_")
  )
    return {
      prompt: specialistValidationCorrectivePrompt(
        basePrompt,
        requestedValidationCode,
      ),
      validationCode: requestedValidationCode,
    };
  return { prompt: basePrompt };
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
    inputHash: string,
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
        inputHash,
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
    let attemptInputHash = context.authority.inputHashForAttempt(
      attempt.attemptId,
    );
    if (
      job === undefined ||
      claim === undefined ||
      attemptInputHash === undefined
    )
      return "incomplete";
    const key = {
      runId: attempt.runId,
      jobId: attempt.jobId,
      attemptId: attempt.attemptId,
      ordinal: attempt.ordinal,
    };
    let candidate: unknown;
    let runnerEvidence: SafeCodexEvidence;
    const durablePrompt =
      context.authority.repairPromptForInput(attempt.jobId, attemptInputHash) ??
      specialistPromptForDurableInput(
        job.prompt,
        attemptInputHash,
        context.authority.retryCodeForJob(attempt.jobId),
      );
    const validationCode = durablePrompt.validationCode;
    const prompt =
      correction === undefined
        ? durablePrompt.prompt
        : correctivePrompt(job.prompt, correction, validationCode);
    if (
      correction === undefined &&
      validationCode?.startsWith("specialist_claim_") === true
    ) {
      const correctedInputHash = codexInputHash({
        stage: "memo",
        prompt,
        outputSchema: SpecialistMemoOutputSchema,
      });
      if (
        !context.authority.persistRepairPrompt({
          jobId: attempt.jobId,
          inputHash: correctedInputHash,
          prompt,
          validationCode,
          at: now(),
        })
      )
        return "incomplete";
      if (
        correctedInputHash !== attemptInputHash &&
        !context.authority.rebindReplacementInput(
          attempt.attemptId,
          correctedInputHash,
        )
      )
        return "incomplete";
      attemptInputHash = correctedInputHash;
    }
    try {
      const attemptDir = join(context.options.attemptRoot, attempt.attemptId);
      mkdirSync(attemptDir, { recursive: true });
      const evidenceDirectory = join(attemptDir, "evidence");
      mkdirSync(evidenceDirectory, { recursive: true });
      for (const source of context.authority
        .sourceArtifactsForJob(job.jobId)
        .filter((artifact) =>
          isSpecialistAttemptReadableSource(job, artifact.artifactId),
        )) {
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
        outputSchema: SpecialistMemoOutputSchema,
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
        `${error.name}: ${error.message}${
          error instanceof CodexIsolationError ? ` (${error.check})` : ""
        }\n`,
      );
      if (error instanceof CodexIsolationError)
        return {
          kind: "isolation_unavailable",
          check: error.check,
          reason: error.reason,
        };
      return "incomplete";
    }
    if (
      !recordEvidence(
        attempt,
        claim,
        job,
        prompt,
        attemptInputHash,
        runnerEvidence,
      )
    )
      return "incomplete";
    const promptRequest = JSON.parse(job.prompt.split("\n", 1)[0]!) as {
      readonly request: SpecialistJobRequest;
    };
    const allowedMetricIds = promptRequest.request.registeredValues.map(
      (value) => value.valueId,
    );
    const evidenceArtifacts = promptRequest.request.evidenceSlice.artifacts.map(
      (artifact, index) => ({
        ...artifact,
        evidenceId: job.sourceArtifactIds[index] ?? artifact.evidenceId,
      }),
    );
    candidate = sanitizeSpecialistDecisiveMetricIds(
      candidate,
      allowedMetricIds,
    );
    candidate = sanitizeSpecialistNumericMetricValues(
      candidate,
      promptRequest.request.registeredValues,
    );
    candidate = sanitizeSpecialistEvidenceTypeBindings(
      candidate,
      evidenceArtifacts,
    );
    candidate = normalizeSpecialistClaimSlotBindings(
      {
        roleId: job.roleId,
        claimSlots: promptRequest.request.claimSlots,
      },
      candidate,
    );
    const claimValidation = validateSpecialistClaimSubmission(
      {
        runId: job.runId,
        snapshotId: job.snapshotId,
        roleId: job.roleId,
        claimSlots: promptRequest.request.claimSlots,
        allowedArtifactIds: job.sourceArtifactIds,
        allowedMetricIds,
        registeredValues: promptRequest.request.registeredValues,
        evidenceArtifacts,
        validateEvidence: false,
      },
      candidate,
    );
    if (!claimValidation.ok) return claimValidation.reason;
    const departmentId = workflowRoleById(job.roleId)?.departmentId;
    if (
      departmentId === undefined ||
      departmentId === "chair" ||
      !context.authority.reserveDepartmentTheses({
        runId: job.runId,
        departmentId,
        roleId: job.roleId,
        fingerprints: specialistThesisFingerprints(candidate),
        at: now(),
      })
    )
      return "specialist_claim_duplicate_thesis";
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
      const nextCorrection = {
        invalidArtifactIds: committed.invalidArtifactIds,
        allowedArtifactIds: committed.allowedArtifactIds,
      };
      const replacementPrompt = correctivePrompt(
        job.prompt,
        nextCorrection,
        validationCode,
      );
      const replacementInputHash = codexInputHash({
        stage: "memo",
        prompt: replacementPrompt,
        outputSchema: SpecialistMemoOutputSchema,
      });
      if (
        !context.authority.persistRepairPrompt({
          jobId: attempt.jobId,
          inputHash: replacementInputHash,
          prompt: replacementPrompt,
          ...(validationCode === undefined ? {} : { validationCode }),
          at: now(),
        })
      )
        return "incomplete";
      if (
        !context.authority.rebindReplacementInput(
          ids.replacementAttemptId,
          replacementInputHash,
        )
      )
        return "incomplete";
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
        nextCorrection,
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
      if (
        typeof outcome === "string" &&
        outcome.startsWith("specialist_claim_")
      )
        return { kind: "repair", code: outcome, retryAt: now() };
      return {
        kind: "repair",
        code:
          outcome === "citation_invalid_after_retry"
            ? "specialist_citation_invalid_after_retry"
            : "specialist_memo_missing",
        retryAt: now(),
      };
    },
  };
}

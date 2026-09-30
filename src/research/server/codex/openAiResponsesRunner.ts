import { z } from "zod";
import { reconcileDepartmentResponse } from "../../workflow/departmentResponseRecovery";
import { reconcileSemanticAuditResponse } from "../../workflow/semanticAuditResponse";
import { collectQuestionWebEvidence } from "../qa/questionWebEvidence";
import {
  effectiveCodexPrompt,
  hydrateLocalizedCandidate,
  modelOutputLocale,
  schemaDocument,
  sha256Value,
  writeExclusiveJson,
} from "./codexArtifacts";
import { CodexRunnerError } from "./codexErrors";
import { createCodexHybridPool } from "./codexHybridPool";
import { CODEX_RUNTIME_POLICY, CODEX_STAGES } from "./codexPolicy";
import {
  codexInputHash,
  type LaunchReservationReader,
  verifyLaunchReservation,
} from "./codexReservation";
import type { CodexPort, CodexRunInput, SafeCodexEvidence } from "./codexTypes";
import { requestOpenAiResponse } from "./openAiTransport";
import {
  OPENAI_RESEARCH_MODEL,
  OPENAI_RUNNER_HASH,
  OPENAI_RUNNER_VERSION,
} from "./researchProvider";

let pool: ReturnType<typeof createCodexHybridPool> | undefined;
function apiPool() {
  const capacity = Number(
    process.env["STOCKSEMBLY_CODEX_API_CONCURRENCY"] ?? 6,
  );
  if (!Number.isSafeInteger(capacity) || capacity <= 0)
    throw new CodexRunnerError("policy_violation");
  pool ??= createCodexHybridPool({
    subscriptionAvailable: () => false,
    apiEnabled: () => true,
    apiCapacity: capacity,
  });
  return pool;
}

export function createOpenAiPort(
  reservations: LaunchReservationReader,
  transport: typeof requestOpenAiResponse = requestOpenAiResponse,
): CodexPort {
  return {
    id: "openai-responses",
    kind: "real",
    async run<Candidate>(input: CodexRunInput<Candidate>) {
      const lease = await apiPool()
        .acquire(input.reservation.key.runId, input.signal)
        .catch((error: unknown) => {
          if (input.signal?.aborted) throw new CodexRunnerError("cancelled");
          throw error;
        });
      try {
        return await run(input, reservations, transport);
      } finally {
        lease.release();
      }
    },
  };
}

async function run<Candidate>(
  input: CodexRunInput<Candidate>,
  reservations: LaunchReservationReader,
  transport: typeof requestOpenAiResponse,
) {
  if (
    !CODEX_STAGES.includes(input.stage) ||
    Buffer.byteLength(input.prompt) >
      (input.stage === "semantic_audit" || input.stage === "chair_synthesis"
        ? CODEX_RUNTIME_POLICY.maxSynthesisPromptBytes
        : CODEX_RUNTIME_POLICY.maxPromptBytes)
  )
    throw new CodexRunnerError("policy_violation");
  const reservation = await verifyLaunchReservation(
    input.reservation,
    reservations,
    codexInputHash(input),
  );
  if (input.signal?.aborted) throw new CodexRunnerError("cancelled");
  const locale = modelOutputLocale(input.prompt);
  const schema = schemaDocument(input.outputSchema, locale);
  const browsingPolicy = CODEX_RUNTIME_POLICY.browsingByStage[input.stage];
  const reasoning = CODEX_RUNTIME_POLICY.reasoningByStage[input.stage];
  const body = {
    model: OPENAI_RESEARCH_MODEL,
    reasoning: { effort: reasoning },
    input: effectiveCodexPrompt(input.prompt, locale),
    max_output_tokens: 32768,
    text: {
      format: {
        type: "json_schema",
        name: "research_output",
        strict: false,
        schema,
      },
    },
    ...(browsingPolicy === "audited_web" &&
    input.captureWebEvidence !== undefined
      ? {
          tools: [{ type: "web_search" }],
          include: ["web_search_call.action.sources"],
        }
      : {}),
  };
  await writeExclusiveJson(input.attemptDir, "output-schema.json", schema);
  await writeExclusiveJson(input.attemptDir, "launch-manifest.json", {
    transport: OPENAI_RUNNER_VERSION,
    executionBackend: "api",
    ...reservation,
    model: OPENAI_RESEARCH_MODEL,
    stage: input.stage,
    reasoning,
    inputHash: codexInputHash(input),
    schemaHash: sha256Value(schema),
  });
  try {
    const response = await transport(body, {
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.onActivity ? { onActivity: input.onActivity } : {}),
    });
    const searches = response.output.filter(
      (item) => item.type === "web_search_call",
    );
    if (searches.length && browsingPolicy !== "audited_web")
      throw new CodexRunnerError("tool_event");
    const urls = [
      ...new Set(
        response.output.flatMap((item) => [
          ...(item.action?.sources ?? []).map((source) => source.url),
          ...(item.content ?? []).flatMap((content) =>
            (content.annotations ?? []).flatMap((annotation) =>
              annotation.url ? [annotation.url] : [],
            ),
          ),
        ]),
      ),
    ].slice(0, 16);
    const transcript = searches.map((item) => ({
      type: "web_search",
      action: item.action ?? null,
    }));
    const transcriptHash = sha256Value(transcript);
    if (urls.length && input.captureWebEvidence) {
      const captures = await Promise.allSettled(
        urls.slice(0, 4).map((url) => collectQuestionWebEvidence(url)),
      );
      const artifacts = captures.flatMap((item) =>
        item.status === "fulfilled" ? [item.value] : [],
      );
      if (
        !(await input.captureWebEvidence({
          reservation: input.reservation,
          transcriptHash,
          searchedUrls: urls,
          artifacts,
        }))
      )
        throw new CodexRunnerError("policy_violation");
    }
    const text = response.output
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((content) => content.type === "output_text")
      .map((content) => content.text ?? "")
      .join("");
    let candidate: unknown;
    try {
      candidate = JSON.parse(text);
    } catch {
      if (input.stage !== "department_consolidation")
        throw new CodexRunnerError("output_invalid");
      candidate = {};
    }
    const hydrated = locale
      ? hydrateLocalizedCandidate(candidate, locale)
      : candidate;
    const original = input.outputSchema.safeParse(hydrated);
    if (!original.success) {
      console.warn(
        JSON.stringify({
          kind: "model_output_contract_invalid",
          stage: input.stage,
          attemptId: input.reservation.key.attemptId,
          issues: original.error.issues.slice(0, 20).map((issue) => ({
            code: issue.code,
            path: issue.path
              .slice(0, 8)
              .map((part) => String(part).slice(0, 64)),
          })),
        }),
      );
    }
    const reconciled =
      input.stage === "semantic_audit"
        ? reconcileSemanticAuditResponse(input.prompt, hydrated)
        : input.stage === "department_consolidation"
          ? reconcileDepartmentResponse(input.prompt, hydrated)
          : hydrated;
    const departmentObject =
      input.stage === "department_consolidation"
        ? z.record(z.string(), z.unknown()).safeParse(reconciled)
        : undefined;
    const recovery =
      departmentObject?.success &&
      departmentObject.data["publicationMode"] === "limited_compilation"
        ? ("department_compilation" as const)
        : undefined;
    const runnerCandidate = departmentObject?.success
      ? Object.fromEntries(
          Object.entries(departmentObject.data).filter(
            ([key]) => key !== "publicationMode",
          ),
        )
      : reconciled;
    const parsed = input.outputSchema.safeParse(runnerCandidate);
    if (!parsed.success) throw new CodexRunnerError("output_invalid");
    if (recovery)
      console.warn(
        JSON.stringify({
          kind: "department_output_recovered",
          attemptId: input.reservation.key.attemptId,
          mode: recovery,
        }),
      );
    if (!original.success)
      console.warn(
        JSON.stringify({
          kind: "model_output_contract_recovered",
          stage: input.stage,
          attemptId: input.reservation.key.attemptId,
        }),
      );
    const evidence: SafeCodexEvidence = {
      executionBackend: "api",
      ordinal: reservation.ordinal,
      stage: input.stage,
      model: OPENAI_RESEARCH_MODEL,
      reasoning,
      browsingPolicy,
      toolTranscriptHash: transcriptHash,
      binaryVersion: OPENAI_RUNNER_VERSION,
      binaryHash: OPENAI_RUNNER_HASH,
      originDevice: "not-applicable",
      originInode: "not-applicable",
      linkDevice: "not-applicable",
      linkInode: "not-applicable",
      profileHash: sha256Value({ transport: OPENAI_RUNNER_VERSION }),
      environmentHash: sha256Value({
        endpoint: "https://api.openai.com/v1/responses",
      }),
      argvHash: sha256Value({ model: OPENAI_RESEARCH_MODEL, reasoning }),
      schemaHash: sha256Value(schema),
      eventTypes: ["response.completed"],
      exitCode: 0,
      toolEventCount: searches.length,
      searchedUrls: urls,
      cleanup: "complete",
      ...(response.usage
        ? {
            tokenUsage: {
              inputTokens: response.usage.input_tokens,
              cachedInputTokens:
                response.usage.input_tokens_details?.cached_tokens ?? 0,
              cacheWriteInputTokens: 0,
              outputTokens: response.usage.output_tokens,
              reasoningOutputTokens:
                response.usage.output_tokens_details?.reasoning_tokens ?? 0,
            },
          }
        : {}),
    };
    await writeExclusiveJson(
      input.attemptDir,
      "tool-transcript.json",
      transcript,
    );
    await writeExclusiveJson(
      input.attemptDir,
      "final-candidate.json",
      parsed.data,
    );
    await writeExclusiveJson(input.attemptDir, "lifecycle.json", {
      ...evidence,
      responseId: response.id,
      ...(recovery ? { recovery } : {}),
    });
    return {
      candidate: parsed.data,
      evidence,
      ...(recovery ? { recovery } : {}),
    };
  } catch (error) {
    await writeExclusiveJson(input.attemptDir, "lifecycle.json", {
      transport: OPENAI_RUNNER_VERSION,
      executionBackend: "api",
      outcome: "failed",
      failureClass:
        error instanceof CodexRunnerError ? error.code : "process_failed",
    });
    throw error;
  }
}

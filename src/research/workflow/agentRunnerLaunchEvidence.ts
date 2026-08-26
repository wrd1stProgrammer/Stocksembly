import { TRUSTED_AGENT_RUNTIME_POLICY } from "../application/commitAgentOutputContracts";
import type { AgentOutputStage } from "../domain/roleRegistry";
import type { RecordAgentRunnerEvidenceInput } from "../ports/agentOutputCommit";
import { CodexRunnerError } from "../server/codex/codexErrors";
import type {
  CodexRunResult,
  SafeCodexEvidence,
} from "../server/codex/codexTypes";

type EvidenceBinding = Omit<
  RecordAgentRunnerEvidenceInput,
  | "stage"
  | "schemaHash"
  | "binaryHash"
  | "cliVersion"
  | "model"
  | "reasoning"
  | "browsingPolicy"
  | "toolTranscriptHash"
> & {
  readonly stage: AgentOutputStage;
  readonly expectedRuntime?: Readonly<{
    readonly model: RecordAgentRunnerEvidenceInput["model"];
    readonly reasoning: RecordAgentRunnerEvidenceInput["reasoning"];
  }>;
};

type SynchronousEvidenceRecorder = {
  readonly recordRunnerEvidence: (
    input: RecordAgentRunnerEvidenceInput,
  ) => boolean;
};

export function recordSuccessfulRunnerEvidence(
  store: SynchronousEvidenceRecorder,
  input: EvidenceBinding,
  evidence: SafeCodexEvidence,
): boolean {
  const expectedRuntime = input.expectedRuntime ?? {
    model: TRUSTED_AGENT_RUNTIME_POLICY.model,
    reasoning: TRUSTED_AGENT_RUNTIME_POLICY.reasoningByStage[input.stage],
  };
  if (
    evidence.ordinal !== input.ordinal ||
    evidence.stage !== input.stage ||
    evidence.model !== expectedRuntime.model ||
    evidence.reasoning !== expectedRuntime.reasoning ||
    evidence.browsingPolicy !==
      TRUSTED_AGENT_RUNTIME_POLICY.browsingByStage[input.stage] ||
    (evidence.browsingPolicy === "disabled" &&
      evidence.toolTranscriptHash !==
        TRUSTED_AGENT_RUNTIME_POLICY.emptyToolTranscriptHash) ||
    evidence.binaryHash !== TRUSTED_AGENT_RUNTIME_POLICY.cliBinaryHash ||
    evidence.binaryVersion !== TRUSTED_AGENT_RUNTIME_POLICY.cliVersion
  )
    return false;
  const { expectedRuntime: _expectedRuntime, ...binding } = input;
  return store.recordRunnerEvidence({
    ...binding,
    schemaHash: evidence.schemaHash,
    binaryHash: evidence.binaryHash,
    cliVersion: evidence.binaryVersion,
    model: evidence.model,
    reasoning: evidence.reasoning,
    browsingPolicy: evidence.browsingPolicy,
    toolTranscriptHash: evidence.toolTranscriptHash,
    toolEventCount: evidence.toolEventCount,
    ...(evidence.tokenUsage === undefined
      ? {}
      : {
          inputTokens: evidence.tokenUsage.inputTokens,
          cachedInputTokens: evidence.tokenUsage.cachedInputTokens,
          cacheWriteInputTokens: evidence.tokenUsage.cacheWriteInputTokens,
          outputTokens: evidence.tokenUsage.outputTokens,
          reasoningOutputTokens: evidence.tokenUsage.reasoningOutputTokens,
        }),
  });
}

export async function runAndRecordSuccessfulRunnerEvidence<Candidate>(
  store: SynchronousEvidenceRecorder,
  input: EvidenceBinding,
  run: () => Promise<CodexRunResult<Candidate>>,
): Promise<CodexRunResult<Candidate> | undefined> {
  let result: CodexRunResult<Candidate>;
  try {
    result = await run();
  } catch (error) {
    if (error instanceof CodexRunnerError) throw error;
    if (error instanceof Error) return undefined;
    throw error;
  }
  return recordSuccessfulRunnerEvidence(store, input, result.evidence)
    ? result
    : undefined;
}

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
  if (
    evidence.ordinal !== input.ordinal ||
    evidence.stage !== input.stage ||
    evidence.model !== TRUSTED_AGENT_RUNTIME_POLICY.model ||
    evidence.reasoning !==
      TRUSTED_AGENT_RUNTIME_POLICY.reasoningByStage[input.stage] ||
    evidence.browsingPolicy !==
      TRUSTED_AGENT_RUNTIME_POLICY.browsingByStage[input.stage] ||
    (evidence.browsingPolicy === "disabled" &&
      evidence.toolTranscriptHash !==
        TRUSTED_AGENT_RUNTIME_POLICY.emptyToolTranscriptHash) ||
    evidence.binaryHash !== TRUSTED_AGENT_RUNTIME_POLICY.cliBinaryHash ||
    evidence.binaryVersion !== TRUSTED_AGENT_RUNTIME_POLICY.cliVersion
  )
    return false;
  return store.recordRunnerEvidence({
    ...input,
    schemaHash: evidence.schemaHash,
    binaryHash: evidence.binaryHash,
    cliVersion: evidence.binaryVersion,
    model: evidence.model,
    reasoning: evidence.reasoning,
    browsingPolicy: evidence.browsingPolicy,
    toolTranscriptHash: evidence.toolTranscriptHash,
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

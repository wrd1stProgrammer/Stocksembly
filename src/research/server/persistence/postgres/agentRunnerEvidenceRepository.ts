import type { RecordAgentRunnerEvidenceInput } from "../../../ports/agentOutputCommit";
import type { ResearchDatabase } from "./database";
export async function recordAgentRunnerEvidence(
  database: ResearchDatabase,
  input: RecordAgentRunnerEvidenceInput,
): Promise<boolean> {
  const changed = (
    await database.query(
      `INSERT INTO research.agent_runner_evidence(
      attempt_id, stage, prompt_hash, schema_hash, input_hash,
      binary_hash, cli_version, model, reasoning, browsing_policy,
      tool_transcript_hash, tool_event_count, input_tokens, cached_input_tokens,
      cache_write_input_tokens, output_tokens, reasoning_output_tokens,
      recorded_at
    ) SELECT
      attempts.attempt_id, $1, $2, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12, $13,
      $14, $15, $16,
      $17
    FROM research.attempts
    JOIN research.jobs ON jobs.job_id = attempts.job_id
    JOIN research.research_call_ordinals ON research_call_ordinals.attempt_id = attempts.attempt_id
    WHERE attempts.run_id = $18
      AND attempts.job_id = $19
      AND attempts.attempt_id = $20
      AND research_call_ordinals.ordinal = $21
      AND attempts.status = 'running'
      AND jobs.status = 'running'
      AND jobs.lease_owner = $22
      AND jobs.lease_token = $23
      AND jobs.lease_expires_at > $17
      AND jobs.input_hash = $4
      AND attempts.input_hash = $4
      AND jobs.input_manifest_hash IS NOT NULL
      AND attempts.input_manifest_hash = jobs.input_manifest_hash`,
      [
        input.stage,
        input.promptHash,
        input.schemaHash,
        input.inputHash,
        input.binaryHash,
        input.cliVersion,
        input.model,
        input.reasoning,
        input.browsingPolicy,
        input.toolTranscriptHash,
        input.toolEventCount ?? null,
        input.inputTokens ?? null,
        input.cachedInputTokens ?? null,
        input.cacheWriteInputTokens ?? null,
        input.outputTokens ?? null,
        input.reasoningOutputTokens ?? null,
        input.now,
        input.runId,
        input.jobId,
        input.attemptId,
        input.ordinal,
        input.ownerId,
        input.token,
      ],
    )
  ).rowCount;
  return changed === 1;
}

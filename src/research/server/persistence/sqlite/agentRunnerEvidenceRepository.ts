import type Database from "better-sqlite3";
import type { RecordAgentRunnerEvidenceInput } from "../../../ports/agentOutputCommit";

export function recordAgentRunnerEvidence(
  database: Database.Database,
  input: RecordAgentRunnerEvidenceInput,
): boolean {
  const changed = database
    .prepare(`INSERT INTO agent_runner_evidence(
      attempt_id, stage, prompt_hash, schema_hash, input_hash,
      binary_hash, cli_version, model, reasoning, browsing_policy,
      tool_transcript_hash, tool_event_count, input_tokens, cached_input_tokens,
      cache_write_input_tokens, output_tokens, reasoning_output_tokens,
      recorded_at
    ) SELECT
      attempts.attempt_id, @stage, @promptHash, @schemaHash, @inputHash,
      @binaryHash, @cliVersion, @model, @reasoning, @browsingPolicy,
      @toolTranscriptHash, @toolEventCount, @inputTokens, @cachedInputTokens,
      @cacheWriteInputTokens, @outputTokens, @reasoningOutputTokens,
      @now
    FROM attempts
    JOIN jobs USING (job_id)
    JOIN research_call_ordinals USING (attempt_id)
    WHERE attempts.run_id = @runId
      AND attempts.job_id = @jobId
      AND attempts.attempt_id = @attemptId
      AND research_call_ordinals.ordinal = @ordinal
      AND attempts.status = 'running'
      AND jobs.status = 'running'
      AND jobs.lease_owner = @ownerId
      AND jobs.lease_token = @token
      AND jobs.lease_expires_at > @now
      AND jobs.input_hash = @inputHash
      AND attempts.input_hash = @inputHash
      AND jobs.input_manifest_hash IS NOT NULL
      AND attempts.input_manifest_hash = jobs.input_manifest_hash`)
    .run({
      ...input,
      toolEventCount: input.toolEventCount ?? null,
      inputTokens: input.inputTokens ?? null,
      cachedInputTokens: input.cachedInputTokens ?? null,
      cacheWriteInputTokens: input.cacheWriteInputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      reasoningOutputTokens: input.reasoningOutputTokens ?? null,
    }).changes;
  return changed === 1;
}

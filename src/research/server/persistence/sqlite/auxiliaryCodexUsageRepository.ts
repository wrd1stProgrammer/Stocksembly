import Database from "better-sqlite3";
import type { SemanticNewsClassifierUsage } from "../../data/insightsentry/insightSentrySemanticNewsClassifier";

type AuxiliaryCodexUsageInput = Omit<SemanticNewsClassifierUsage, "phase" | "reasoning"> & {
  readonly phase: SemanticNewsClassifierUsage["phase"] | "research_brief";
  readonly reasoning: "low" | "medium";
  readonly runId: string;
  readonly recordedAt: string;
};

export function recordAuxiliaryCodexUsage(
  databasePath: string,
  input: AuxiliaryCodexUsageInput,
): void {
  const database = new Database(databasePath, { timeout: 5_000 });
  try {
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    database
      .prepare(`INSERT OR IGNORE INTO auxiliary_codex_usage(
        call_id, run_id, purpose, model, reasoning, tool_event_count,
        input_tokens, cached_input_tokens, cache_write_input_tokens,
        output_tokens, reasoning_output_tokens, recorded_at
      ) VALUES (
        @callId, @runId, @purpose, @model, @reasoning, @toolEventCount,
        @inputTokens, @cachedInputTokens, @cacheWriteInputTokens,
        @outputTokens, @reasoningOutputTokens, @recordedAt
      )`)
      .run({
        ...input,
        purpose: input.phase === "research_brief" ? "research_brief" : `semantic_news_${input.phase}`,
        inputTokens: input.inputTokens ?? null,
        cachedInputTokens: input.cachedInputTokens ?? null,
        cacheWriteInputTokens: input.cacheWriteInputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        reasoningOutputTokens: input.reasoningOutputTokens ?? null,
      });
  } finally {
    database.close();
  }
}

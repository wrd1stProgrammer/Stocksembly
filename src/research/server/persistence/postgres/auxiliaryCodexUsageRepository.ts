import type { SemanticNewsClassifierUsage } from "../../data/insightsentry/insightSentrySemanticNewsClassifier";
import type { ResearchDatabase } from "./database";

type AuxiliaryCodexUsageInput = Omit<
  SemanticNewsClassifierUsage,
  "phase" | "reasoning"
> & {
  readonly phase: SemanticNewsClassifierUsage["phase"] | "research_brief";
  readonly reasoning: "low" | "medium";
  readonly runId: string;
  readonly recordedAt: string;
};
export async function recordAuxiliaryCodexUsage(
  database: ResearchDatabase,
  input: AuxiliaryCodexUsageInput,
): Promise<void> {
  try {
    await database.query(
      `INSERT INTO research.auxiliary_codex_usage(
        call_id, run_id, purpose, model, reasoning, tool_event_count,
        input_tokens, cached_input_tokens, cache_write_input_tokens,
        output_tokens, reasoning_output_tokens, recorded_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12
      ) ON CONFLICT DO NOTHING`,
      [
        input.callId,
        input.runId,
        input.phase === "research_brief"
          ? "research_brief"
          : `semantic_news_${input.phase}`,
        input.model,
        input.reasoning,
        input.toolEventCount,
        input.inputTokens ?? null,
        input.cachedInputTokens ?? null,
        input.cacheWriteInputTokens ?? null,
        input.outputTokens ?? null,
        input.reasoningOutputTokens ?? null,
        input.recordedAt,
      ],
    );
  } finally {
  }
}

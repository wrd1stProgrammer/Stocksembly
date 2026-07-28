import type { ExternalAnswerSource } from "../../domain/question";
import { createInsightSentryClient } from "../data/insightsentry/insightSentryClient";
import { loadInsightSentryConfig } from "../data/insightsentry/insightSentryConfig";
import { InsightSentryClientError } from "../data/insightsentry/insightSentryFailureClassifier";
import { createInsightSentryMarket } from "../data/insightsentry/insightSentryMarket";

type Input = {
  readonly dataRoot: string;
  readonly providerCode: string | undefined;
};

export async function collectQuestionMarketEvidence(
  input: Input,
): Promise<ExternalAnswerSource | undefined> {
  if (input.providerCode === undefined) return undefined;
  const configuration = loadInsightSentryConfig();
  if (configuration.status !== "available") return undefined;
  try {
    const quote = await createInsightSentryMarket(
      createInsightSentryClient({
        configuration,
        dataRoot: input.dataRoot,
      }),
    ).quote(input.providerCode);
    const retrievedAt = quote.observedAt ?? new Date().toISOString();
    return {
      url: `https://${configuration.config.rapidApiHost}/v3/symbols/quotes?codes=${encodeURIComponent(input.providerCode)}`,
      title: `${input.providerCode} current market quote`,
      publisher: "Licensed market data",
      retrievedAt,
      excerpt: JSON.stringify({
        providerCode: quote.providerCode,
        marketState: quote.marketState,
        observedAt: quote.observedAt,
        lastPrice: quote.lastPrice,
        currency: quote.currency,
      }),
    };
  } catch (error) {
    if (
      error instanceof InsightSentryClientError ||
      error instanceof RangeError
    )
      return undefined;
    throw error;
  }
}

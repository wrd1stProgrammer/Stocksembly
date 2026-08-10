import {
  collectInsightSentryCalendar,
  collectInsightSentryDocuments,
} from "./insightSentryDocumentsCalendar";
import { collectInsightSentryFundamentals } from "./insightSentryFundamentals";
import { collectInsightSentryNews } from "./insightSentryNews";
import {
  collectInsightSentryOptions,
  collectInsightSentryPeers,
} from "./insightSentryPeersOptions";
import type {
  InsightSentryResearchDataAdapter,
  InsightSentryResearchDataOptions,
} from "./insightSentryResearchContracts";

export function createInsightSentryResearchDataAdapter(
  options: InsightSentryResearchDataOptions,
): InsightSentryResearchDataAdapter {
  return Object.freeze({
    fundamentals: async (input) =>
      await collectInsightSentryFundamentals({
        client: options.client,
        rollout: options.rollout,
        ...input,
      }),
    news: async (input) =>
      await collectInsightSentryNews({
        client: options.client,
        rollout: options.rollout,
        classifyNews: options.classifyNews,
        ...(options.dataRoot === undefined
          ? {}
          : { dataRoot: options.dataRoot }),
        ...input,
      }),
    documents: async (input) =>
      await collectInsightSentryDocuments({
        client: options.client,
        rollout: options.rollout,
        ...input,
      }),
    calendar: async (input) =>
      await collectInsightSentryCalendar({
        client: options.client,
        rollout: options.rollout,
        ...input,
      }),
    peers: async (input) =>
      await collectInsightSentryPeers({
        rollout: options.rollout,
        screenPeers: options.screenPeers,
        ...input,
      }),
    options: async (input) =>
      await collectInsightSentryOptions({
        client: options.client,
        rollout: options.rollout,
        ...input,
      }),
  });
}

import { describe, expect, it } from "vitest";
import type { NewsDataset } from "../../research/server/data/insightsentry/insightSentryResearchContracts";
import type { BriefingWatchlistItem } from "../domain/contracts";
import { mapBriefingNews } from "./briefingCollectorNews";

const item: BriefingWatchlistItem = {
  symbol: "AMZN",
  providerCode: "NASDAQ:AMZN",
  company: "Amazon.com, Inc.",
  exchange: "NASDAQ",
  position: 0,
  createdAt: "2026-08-10T00:00:00.000Z",
};
const publishedAt = "2026-08-11T10:00:00.000Z";

function newsDataset(): NewsDataset {
  return {
    pitSafe: false,
    limitations: ["provider_dataset_not_point_in_time_safe"],
    providerUpdatedAt: publishedAt,
    retrievedAt: publishedAt,
    symbol: item.providerCode,
    providerCalls: 1,
    rawItemCount: 5,
    events: [
      "AMZN Bull of the Day: Why Amazon Is a Top Pick",
      "Amazon is a must-own stock for investors",
      "Amazon stock to buy before its price target rises",
      "Sponsored: Amazon is a top pick to watch",
      "Amazon reports AWS growth after an analyst said demand remains resilient",
    ].map((title, index) => ({
      eventKey: `news:${index + 1}`,
      category: "company" as const,
      teamRelevance: ["company"] as const,
      relevance: 0.9,
      direction: "positive" as const,
      horizon: "near_term" as const,
      verificationNeed: "recommended" as const,
      title,
      publishedAt,
    })),
    excerpts: [],
    providerEvidence: [],
  };
}

describe("briefing news policy", () => {
  it("rejects promotional recommendations but keeps factual issuer reporting", () => {
    const mapped = mapBriefingNews({
      result: {
        status: "fulfilled",
        value: { status: "available", data: newsDataset() },
      },
      item,
      startAt: "2026-08-11T00:00:00.000Z",
      cutoffAt: "2026-08-11T12:00:00.000Z",
    });

    expect(mapped.signals.map((signal) => signal.title)).toEqual([
      "Amazon reports AWS growth after an analyst said demand remains resilient",
    ]);
  });
});

import { expect, it } from "vitest";
import type { NewsClassifierRequest } from "./insightSentryResearchContracts";
import { createInsightSentryResearchDataAdapter } from "./insightSentryResearchData";
import {
  AS_OF,
  type CapturedRequest,
  fixtureClient,
  ROLLOUT,
} from "./insightSentryResearchData.testSupport";

export function registerInsightSentryNewsClusteringCases(): void {
  it("clusters semantic near-duplicates before classification and preserves opposition", async () => {
    // Given
    const requests: CapturedRequest[] = [];
    const classifierCalls: NewsClassifierRequest[] = [];
    const adapter = createInsightSentryResearchDataAdapter({
      client: fixtureClient(
        {
          news: {
            last_update: 1_721_865_600,
            total_items: 3,
            current_items: 3,
            page: 1,
            has_next: false,
            data: [
              {
                title: "NVIDIA raises annual revenue guidance",
                source: "Reuters",
                link: "https://example.com/raises",
                content: "NVIDIA raised its full-year sales outlook.",
                published_at: 1_721_865_500,
                related_symbols: ["NASDAQ:NVDA"],
              },
              {
                title: "Nvidia lifts full-year sales outlook",
                source: "MarketWire",
                link: "https://example.com/lifts",
                content: "The chipmaker lifted annual revenue guidance.",
                published_at: 1_721_865_100,
                related_symbols: ["NASDAQ:NVDA"],
              },
              {
                title: "NVIDIA cuts annual revenue guidance",
                source: "Reuters",
                link: "https://example.com/cuts",
                content: "NVIDIA cut its full-year sales outlook.",
                published_at: 1_721_864_900,
                related_symbols: ["NASDAQ:NVDA"],
              },
            ],
          },
        },
        requests,
      ),
      rollout: ROLLOUT,
      classifyNews: async (request) => {
        classifierCalls.push(request);
        return {
          classifications: request.candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            eventKey: "annual-guidance",
            category: "company",
            relevance: 1,
            materiality: "material",
            novelty: "unique",
            direction: candidate.title.includes("cuts")
              ? "negative"
              : "positive",
            horizon: "near_term",
            verificationNeed: "recommended",
          })),
        };
      },
      screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
    });

    // When
    const result = await adapter.news({
      symbol: "NASDAQ:NVDA",
      companyName: "NVIDIA",
      asOf: AS_OF,
      existingEventKeys: [],
    });

    // Then
    expect(classifierCalls).toHaveLength(1);
    expect(classifierCalls[0]?.candidates).toHaveLength(2);
    expect(classifierCalls[0]?.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bundleSize: 2,
          alternateTitles: ["Nvidia lifts full-year sales outlook"],
        }),
      ]),
    );
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.data.events.map((event) => event.direction)).toEqual(
      expect.arrayContaining(["positive", "negative"]),
    );
  });
}

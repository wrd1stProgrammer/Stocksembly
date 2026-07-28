import { expect, it } from "vitest";
import { createInsightSentryResearchDataAdapter } from "./insightSentryResearchData";
import {
  AS_OF,
  type CapturedRequest,
  fixtureClient,
  ROLLOUT,
} from "./insightSentryResearchData.testSupport";

export function registerInsightSentryValidationCases(): void {
  it.each([
    [
      "missing publication timestamp",
      "news",
      {
        last_update: 1_721_865_600,
        total_items: 1,
        current_items: 1,
        page: 1,
        has_next: false,
        data: [{ title: "Timestamp absent" }],
      },
    ],
    [
      "schema drift",
      "fundamentals",
      {
        code: "NASDAQ:NVDA",
        last_update: "not-a-timestamp",
        data: [],
      },
    ],
  ] as const)(
    "withholds malformed %s payloads",
    async (_case, endpoint, body) => {
      // Given
      const requests: CapturedRequest[] = [];
      const adapter = createInsightSentryResearchDataAdapter({
        client: fixtureClient({ [endpoint]: body }, requests),
        rollout: ROLLOUT,
        classifyNews: async () => ({ classifications: [] }),
        screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
      });

      // When
      const result =
        endpoint === "news"
          ? await adapter.news({
              symbol: "NASDAQ:NVDA",
              companyName: "NVIDIA",
              asOf: AS_OF,
              existingEventKeys: [],
            })
          : await adapter.fundamentals({
              symbol: "NASDAQ:NVDA",
              asOf: AS_OF,
              seriesIndicatorIds: [],
              periods: 12,
            });

      // Then
      expect(result).toEqual({
        status: "unavailable",
        limitation: "provider_unavailable",
      });
    },
  );
}

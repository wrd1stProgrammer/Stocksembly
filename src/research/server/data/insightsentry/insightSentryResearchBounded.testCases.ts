import { expect, it } from "vitest";
import {
  NEWS_CLASSIFIER_MODEL,
  NEWS_CLASSIFIER_REASONING,
  type NewsClassifierRequest,
} from "./insightSentryResearchContracts";
import { createInsightSentryResearchDataAdapter } from "./insightSentryResearchData";
import { FundamentalsResponseSchema } from "./insightSentryResearchSchemas";
import {
  AS_OF,
  type CapturedRequest,
  classifier,
  fixtureClient,
  ROLLOUT,
} from "./insightSentryResearchData.testSupport";

export function registerInsightSentryBoundedDataCases(): void {
  it("bounds fundamentals and batches at most twenty series ids by five", async () => {
    // Given
    const requests: CapturedRequest[] = [];
    const indicators = [
      ...Array.from({ length: 75 }, (_, index) => ({
        id: `metric_${String(index).padStart(2, "0")}`,
        name: `Metric ${index}`,
        value: index,
      })),
      { id: "zz_net_income_fy", name: "Net income", value: 100 },
    ];
    const points = Array.from({ length: 25 }, (_, index) => ({
      time: 1_700_000_000 + index,
      close: index,
    }));
    const client = fixtureClient(
      {
        fundamentals: {
          code: "NASDAQ:NVDA",
          last_update: 1_721_865_600_000,
          data: indicators,
        },
        fundamentals_series: {
          code: "NASDAQ:NVDA",
          last_update: 1_721_865_600_000,
          total_items: 5,
          data: Array.from({ length: 5 }, (_, index) => ({
            id: `series_${index}`,
            name: `Series ${index}`,
            data: points,
          })),
        },
      },
      requests,
    );
    const adapter = createInsightSentryResearchDataAdapter({
      client,
      rollout: ROLLOUT,
      classifyNews: async () => ({ classifications: [] }),
      screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
    });

    // When
    const result = await adapter.fundamentals({
      symbol: "NASDAQ:NVDA",
      asOf: AS_OF,
      seriesIndicatorIds: Array.from(
        { length: 25 },
        (_, index) => `series_${index}`,
      ),
      periods: 25,
    });

    // Then
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.data.indicators).toHaveLength(60);
    expect(result.data.indicators.map((indicator) => indicator.id)).toContain(
      "zz_net_income_fy",
    );
    const seriesRequests = requests.filter(
      (request) => request.endpoint === "fundamentals_series",
    );
    expect(seriesRequests).toHaveLength(4);
    expect(
      seriesRequests.every(
        (request) => String(request.parameters["ids"]).split(",").length <= 5,
      ),
    ).toBe(true);
    expect(
      result.data.series.every((series) => series.points.length <= 20),
    ).toBe(true);
    expect(result.data.pitSafe).toBe(false);
  });

  it("accepts live JSON fundamental values and keeps only decision-safe scalars", async () => {
    // Given
    const payload = {
      code: "NASDAQ:NVDA",
      last_update: 1_721_865_600_000,
      data: [
        {
          id: "revenue",
          type: "number",
          value: 100,
        },
        {
          id: "is_profitable",
          type: "boolean",
          value: true,
        },
        {
          id: "intraday",
          type: "object",
          value: { open: 10, close: 11 },
        },
        {
          id: "mixed_history",
          type: "array",
          value: [10, null, { close: 11 }, "12"],
        },
      ],
    };
    const parsedPayload = FundamentalsResponseSchema.safeParse(payload);
    if (!parsedPayload.success) throw parsedPayload.error;
    const adapter = createInsightSentryResearchDataAdapter({
      client: fixtureClient(
        {
          fundamentals: payload,
        },
        [],
      ),
      rollout: ROLLOUT,
      classifyNews: async () => ({ classifications: [] }),
      screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
    });

    // When
    const result = await adapter.fundamentals({
      symbol: "NASDAQ:NVDA",
      asOf: AS_OF,
      seriesIndicatorIds: [],
      periods: 12,
    });

    // Then
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.data.indicators).toHaveLength(3);
    expect(result.data.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "is_profitable", value: "true" }),
        expect.objectContaining({ id: "mixed_history", value: [10, "12"] }),
        expect.objectContaining({ id: "revenue", value: 100 }),
      ]),
    );
  });

  it("keeps opposed material news and skips the older window", async () => {
    // Given
    const requests: CapturedRequest[] = [];
    const classifierCalls: NewsClassifierRequest[] = [];
    const rawNews = {
      last_update: 1_721_865_600,
      total_items: 3,
      current_items: 3,
      page: 1,
      has_next: false,
      hasNext: false,
      current_page: 1,
      total_page: 1,
      data: [
        {
          title: "Raises guidance",
          source: "Wire",
          link: "https://example.com/a",
          content: "Raised.",
          published_at: 1_721_865_500,
        },
        {
          title: "Cuts guidance",
          source: "Wire",
          link: "https://example.com/b",
          content: "Cut.",
          published_at: 1_721_865_400,
        },
        {
          title: "Raises guidance",
          source: "Wire",
          link: "https://example.com/a",
          content: "Duplicate.",
          published_at: 1_721_865_500,
        },
      ],
    };
    const adapter = createInsightSentryResearchDataAdapter({
      client: fixtureClient({ news: rawNews }, requests),
      rollout: ROLLOUT,
      classifyNews: classifier(classifierCalls, true),
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
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.data.providerCalls).toBe(1);
    expect(result.data.events.map((event) => event.direction)).toHaveLength(2);
    expect(result.data.events.map((event) => event.direction)).toEqual(
      expect.arrayContaining(["positive", "negative"]),
    );
    expect(result.data.excerpts).toHaveLength(2);
    expect(result.data.providerEvidence).toHaveLength(2);
    expect(classifierCalls[0]).toMatchObject({
      model: NEWS_CLASSIFIER_MODEL,
      reasoning: NEWS_CLASSIFIER_REASONING,
    });
  });

  it("uses the older window but emits no evidence without unique material news", async () => {
    // Given
    const requests: CapturedRequest[] = [];
    const adapter = createInsightSentryResearchDataAdapter({
      client: fixtureClient(
        {
          news: {
            last_update: 1_721_865_600,
            total_items: 1,
            current_items: 1,
            page: 1,
            has_next: false,
            hasNext: false,
            current_page: 1,
            total_page: 1,
            data: [{ title: "Rumor", published_at: 1_721_865_500 }],
          },
        },
        requests,
      ),
      rollout: ROLLOUT,
      classifyNews: classifier([], false),
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
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.data.providerCalls).toBe(2);
    expect(result.data.rawItemCount).toBeLessThanOrEqual(200);
    expect(result.data.events).toEqual([]);
    expect(result.data.providerEvidence).toEqual([]);
  });
}

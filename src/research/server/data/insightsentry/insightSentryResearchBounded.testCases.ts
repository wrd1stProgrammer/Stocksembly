import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  NEWS_CLASSIFIER_MODEL,
  NEWS_CLASSIFIER_REASONING,
  type NewsClassifierRequest,
} from "./insightSentryResearchContracts";
import { createInsightSentryResearchDataAdapter } from "./insightSentryResearchData";
import {
  AS_OF,
  type CapturedRequest,
  classifier,
  fixtureClient,
  ROLLOUT,
} from "./insightSentryResearchData.testSupport";
import { FundamentalsResponseSchema } from "./insightSentryResearchSchemas";

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
    expect(result.data.indicators).toHaveLength(76);
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

  it("preserves nested segment history from live fundamental JSON", async () => {
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
    expect(result.data.indicators).toHaveLength(4);
    expect(result.data.indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "is_profitable", value: true }),
        expect.objectContaining({
          id: "intraday",
          value: { open: 10, close: 11 },
        }),
        expect.objectContaining({
          id: "mixed_history",
          value: [10, null, { close: 11 }, "12"],
        }),
        expect.objectContaining({ id: "revenue", value: 100 }),
      ]),
    );
  });

  it("keeps the fundamental snapshot when one historical-series batch fails", async () => {
    const requests: CapturedRequest[] = [];
    const base = fixtureClient(
      {
        fundamentals: {
          code: "NASDAQ:NVDA",
          last_update: 1_721_865_600_000,
          data: [{ id: "total_revenue_fq", value: 100 }],
        },
        fundamentals_series: {
          code: "NASDAQ:NVDA",
          last_update: 1_721_865_600_000,
          total_items: 1,
          data: [
            {
              id: "total_revenue_fq",
              name: "Revenue",
              data: [{ time: 1_700_000_000, value: 100 }],
            },
          ],
        },
      },
      requests,
    );
    let seriesCalls = 0;
    const client = {
      get: async <T>(request: Parameters<typeof base.get<T>>[0]) => {
        if (request.endpoint === "fundamentals_series" && seriesCalls++ === 1)
          throw new Error("one invalid provider series batch");
        return await base.get(request);
      },
    };
    const adapter = createInsightSentryResearchDataAdapter({
      client,
      rollout: ROLLOUT,
      classifyNews: async () => ({ classifications: [] }),
      screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
    });

    const result = await adapter.fundamentals({
      symbol: "NASDAQ:NVDA",
      asOf: AS_OF,
      seriesIndicatorIds: [
        "total_revenue_fq",
        "gross_margin_fq",
        "operating_margin_fq",
        "net_income_fq",
        "free_cash_flow_fq",
        "invalid_provider_id",
      ],
      periods: 12,
    });

    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.data.indicators).toEqual([
      expect.objectContaining({ id: "total_revenue_fq", value: 100 }),
    ]);
    expect(result.data.series).toHaveLength(1);
    expect(result.data.unavailableSeriesIds).toContain("invalid_provider_id");
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

  it("screens the broad news pool once, details at most twenty, and reuses classified history", async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), "stocksembly-news-ledger-"));
    try {
      const requests: CapturedRequest[] = [];
      const classifierCalls: NewsClassifierRequest[] = [];
      const cutoff = Date.parse(AS_OF) / 1_000;
      const payload = (data: readonly object[]) => ({
        last_update: cutoff,
        total_items: data.length,
        current_items: data.length,
        page: 1,
        has_next: false,
        data,
      });
      const recent = Array.from({ length: 45 }, (_, index) => ({
        title: `Earnings recentcode${index}`,
        source: `RecentWire${index}`,
        link: `https://example.com/recent/${index}`,
        content: `Recent issuer event ${index}`,
        published_at: cutoff - index * 60,
        related_symbols: ["NASDAQ:NVDA"],
      }));
      const archive = Array.from({ length: 6 }, (_, index) => ({
        title: `Archive earnings archivecode${index}`,
        source: `ArchiveWire${index}`,
        link: `https://example.com/archive/${index}`,
        content: `Historical structural event ${index}`,
        published_at: cutoff - (10 + index) * 24 * 60 * 60,
        related_symbols: ["NASDAQ:NVDA"],
      }));
      const adapter = createInsightSentryResearchDataAdapter({
        client: fixtureClient(
          {
            "news:2026-07-17:": payload(recent),
            "news:2026-06-24:": payload(archive),
          },
          requests,
        ),
        rollout: ROLLOUT,
        dataRoot,
        classifyNews: async (request) => {
          classifierCalls.push(request);
          return {
            classifications: request.candidates.map((candidate) => ({
              candidateId: candidate.candidateId,
              eventKey: candidate.clusterId,
              category: "company",
              relevance: candidate.title.startsWith("Archive") ? 1 : 0.7,
              materiality: "material",
              novelty: "unique",
              direction: "neutral",
              horizon: "near_term",
              verificationNeed: "recommended",
            })),
          };
        },
        screenPeers: async () => ({ retrievedAt: AS_OF, peers: [] }),
      });
      const input = {
        symbol: "NASDAQ:NVDA",
        companyName: "NVIDIA",
        asOf: AS_OF,
        existingEventKeys: [],
        collectionMode: "research" as const,
        researchContext: {
          question: "How do earnings events change the medium-term thesis?",
          investmentHorizon: "medium" as const,
          analysisDepth: "standard" as const,
          decisionPurpose: "holding_review" as const,
        },
      };

      const cold = await adapter.news(input);
      const coldClassifierCalls = classifierCalls.length;
      const warm = await adapter.news(input);

      expect(cold.status).toBe("available");
      expect(warm.status).toBe("available");
      if (cold.status !== "available" || warm.status !== "available") return;
      expect(cold.data.providerCalls).toBe(2);
      expect(warm.data.providerCalls).toBe(1);
      expect(
        requests
          .filter((request) => request.endpoint === "news")
          .every(
            // biome-ignore lint/complexity/useLiteralKeys: the parameter bag is an index signature.
            (request) => request.parameters["limit"] === 100,
          ),
      ).toBe(true);
      expect(coldClassifierCalls).toBe(2);
      expect(classifierCalls[0]).toMatchObject({ phase: "shortlist" });
      expect(classifierCalls[0]?.candidates.length).toBeGreaterThan(20);
      expect(classifierCalls[1]).toMatchObject({ phase: "detail" });
      expect(classifierCalls[1]?.candidates.length).toBeLessThanOrEqual(20);
      expect(classifierCalls).toHaveLength(coldClassifierCalls);
      expect(
        warm.data.events.some((event) =>
          event.teamRelevance.includes("financial"),
        ),
      ).toBe(true);
      expect(
        warm.data.events.some((event) => event.title.startsWith("Archive")),
      ).toBe(true);
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });
}

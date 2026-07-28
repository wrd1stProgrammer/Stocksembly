import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type ArtifactCasPort,
  type ArtifactDescriptor,
  ArtifactDigestSchema,
  type ArtifactRead,
  type ArtifactWrite,
} from "../ports/artifacts";
import {
  canonicalInsightSentryCacheKey,
  createInsightSentryClient,
} from "../server/data/insightsentry/insightSentryClient";
import { loadInsightSentryConfig } from "../server/data/insightsentry/insightSentryConfig";
import type {
  InsightSentryWireAdapter,
  InsightSentryWireResponse,
} from "../server/data/insightsentry/insightSentryTransport";
import {
  defaultResearchQuestion,
  normalizeResearchQuestion,
} from "./initialCollectionHandler";
import { collectInsightSentryInitialEvidence } from "./insightSentryInitialCollection";

const PROVIDER_CONFIGURATION = loadInsightSentryConfig({
  INSIGHTSENTRY_RAPIDAPI_KEY: "fixture-only",
  INSIGHTSENTRY_RAPIDAPI_HOST: "insightsentry.p.rapidapi.com",
});
const RUN_ID = "00000000-0000-4000-8000-000000000061";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000062";
const AS_OF = "2026-07-24T12:00:00.000Z";

function wireResponse(status: number, body: string): InsightSentryWireResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: (async function* () {
      yield Buffer.from(body);
    })(),
    abort: () => undefined,
  };
}

class CollectionCas implements ArtifactCasPort {
  private readonly values = new Map<string, ArtifactRead>();

  async put(artifact: ArtifactWrite): Promise<ArtifactDescriptor> {
    const digest = ArtifactDigestSchema.parse(
      createHash("sha256").update(artifact.bytes).digest("hex"),
    );
    const descriptor = Object.freeze({
      artifactId: artifact.artifactId,
      runId: artifact.runId,
      snapshotId: artifact.snapshotId,
      digest,
      byteLength: artifact.bytes.byteLength,
      mediaType: artifact.mediaType,
      parentDigests: Object.freeze([...artifact.parentDigests]),
    });
    this.values.set(digest, {
      descriptor,
      bytes: Uint8Array.from(artifact.bytes),
    });
    return descriptor;
  }

  async get(digest: z.infer<typeof ArtifactDigestSchema>) {
    return this.values.get(digest);
  }

  async has(digest: z.infer<typeof ArtifactDigestSchema>) {
    return this.values.has(digest);
  }
}

describe("normalizeResearchQuestion", () => {
  it("treats an empty optional question as the default full analysis", () => {
    expect(normalizeResearchQuestion("")).toBeUndefined();
    expect(normalizeResearchQuestion("   ")).toBeUndefined();
  });

  it("preserves a supplied research question without surrounding whitespace", () => {
    expect(normalizeResearchQuestion("  What changes the thesis?  ")).toBe(
      "What changes the thesis?",
    );
  });
});

describe("defaultResearchQuestion", () => {
  it("provides an investment decision mandate when the home question is blank", () => {
    expect(defaultResearchQuestion("NVDA", "ko")).toContain("투자 매력도");
    expect(defaultResearchQuestion("AAPL", "en")).toContain(
      "current investment case",
    );
  });
});

describe("InsightSentry initial workflow collection", () => {
  it("uses cache/skip behavior to keep a successful cold run at ten calls and a repeat within five to eight", async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), "insightsentry-success-"));
    const adapter: InsightSentryWireAdapter = async (request) => {
      const path = decodeURIComponent(request.url.pathname);
      if (path.endsWith("/info"))
        return wireResponse(
          200,
          JSON.stringify({
            code: "NASDAQ:NVDA",
            name: "NVIDIA Corporation",
            exchange: "NASDAQ",
            currency_code: "USD",
          }),
        );
      if (path.endsWith("/quotes"))
        return wireResponse(
          200,
          JSON.stringify({
            total_items: 1,
            data: [
              {
                code: "NASDAQ:NVDA",
                status: "CLOSED",
                lp_time: 1_753_348_800,
                last_price: 174,
                currency_code: "USD",
              },
            ],
          }),
        );
      if (path.endsWith("/fundamentals/series"))
        return wireResponse(
          200,
          JSON.stringify({
            code: "NASDAQ:NVDA",
            last_update: 1_753_348_800_000,
            total_items: 1,
            data: [
              {
                id: "revenue",
                name: "Revenue",
                data: [{ time: 1_753_000_000, value: 10 }],
              },
            ],
          }),
        );
      if (path.endsWith("/series")) {
        const interval = Number(request.url.searchParams.get("bar_interval"));
        const series = Array.from({ length: 40 }, (_, index) => ({
          time: 1_753_000_000 + index * interval * 3_600,
          open: 150 + index * 0.5,
          high: 151 + index * 0.5,
          low: 149 + index * 0.5,
          close: 150.5 + index * 0.5,
          volume: 1_000 + index * 10,
        }));
        return wireResponse(
          200,
          JSON.stringify({
            code: "NASDAQ:NVDA",
            last_update: 1_753_348_800_000,
            _ct: 1_753_348_800_000,
            bar_type: `${interval}h`,
            series,
          }),
        );
      }
      if (path.endsWith("/fundamentals"))
        return wireResponse(
          200,
          JSON.stringify({
            code: "NASDAQ:NVDA",
            last_update: 1_753_348_800_000,
            data: [
              {
                id: "revenue",
                name: "Revenue",
                category: "income",
                value: 10,
              },
            ],
          }),
        );
      if (path.endsWith("/newsfeed"))
        return wireResponse(
          200,
          JSON.stringify({
            last_update: 1_753_348_800,
            total_items: 1,
            current_items: 1,
            page: 1,
            has_next: false,
            data: [
              {
                link: "https://example.com/nvda-product",
                title: "NVIDIA launches a new product",
                source: "Fixture Wire",
                content: "A material company product event.",
                published_at: 1_753_348_000,
              },
            ],
          }),
        );
      if (path.endsWith("/documents"))
        return wireResponse(200, JSON.stringify([]));
      if (path.endsWith("/calendar/earnings"))
        return wireResponse(
          200,
          JSON.stringify({
            total_count: 0,
            range: "13w",
            last_update: 1_753_348_800,
            data: [],
          }),
        );
      return wireResponse(404, "{}");
    };
    const common = {
      dataRoot: root,
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      identity: {
        cik: "0001045810",
        ticker: "NVDA",
        legalName: "NVIDIA Corporation",
        exchange: "NASDAQ",
        identityHash: "a".repeat(64),
      },
      configuration: PROVIDER_CONFIGURATION,
      adapter,
    } as const;

    // When
    const cold = await collectInsightSentryInitialEvidence({
      ...common,
      asOf: AS_OF,
      cas: new CollectionCas(),
    });
    const warm = await collectInsightSentryInitialEvidence({
      ...common,
      asOf: "2026-07-24T12:16:00.000Z",
      cas: new CollectionCas(),
    });

    // Then
    expect(cold.requestLedger.uniqueUpstreamCalls).toBe(10);
    expect(warm.requestLedger.uniqueUpstreamCalls).toBeGreaterThanOrEqual(5);
    expect(warm.requestLedger.uniqueUpstreamCalls).toBeLessThanOrEqual(8);
    expect(cold.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dataset: "market_bars" }),
        expect.objectContaining({
          dataset: "insightsentry_fundamentals",
        }),
        expect.objectContaining({
          dataset: "insightsentry_news_company",
        }),
      ]),
    );
    const technical = cold.sources.find(
      (source) => source.evidenceId === "insightsentry:technical",
    );
    if (technical === undefined)
      throw new TypeError("technical source fixture missing");
    const decoded = JSON.parse(new TextDecoder().decode(technical.bytes));
    expect(
      decoded.analysis.timeframes.map(
        (value: { timeframe: string }) => value.timeframe,
      ),
    ).toEqual(["1h", "4h", "1d"]);
    expect(decoded.analysis.timeframes[0]).toEqual(
      expect.objectContaining({
        movingAverages: expect.any(Object),
        rsi14: expect.any(Number),
        macd: expect.any(Number),
        atr14: expect.any(Number),
        volumeRatio20: expect.any(Number),
        support: expect.any(Number),
        resistance: expect.any(Number),
        bullishInvalidation: expect.any(Number),
      }),
    );
    expect(decoded.analysis.timeframeAgreement).toMatch(
      /^(?:agrees_bullish|agrees_bearish|disagrees)$/u,
    );
    await rm(root, { recursive: true, force: true });
  });

  it("records one cold upstream call and zero warm upstream calls for the same cached request", async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), "insightsentry-ledger-"));
    const request = {
      endpoint: "ledger_fixture",
      pathSegments: ["symbols", "NASDAQ:NVDA", "fixture"],
      parameters: {},
      asOfBucket: "2026-07-24",
      cacheTtlMilliseconds: 60_000,
      schema: z.object({ ok: z.literal(true) }).strict(),
    } as const;
    const coldCalls = new Set<string>();
    const warmCalls = new Set<string>();
    const adapter: InsightSentryWireAdapter = async () =>
      wireResponse(200, JSON.stringify({ ok: true }));
    const makeClient = (calls: Set<string>) =>
      createInsightSentryClient({
        configuration: PROVIDER_CONFIGURATION,
        dataRoot: root,
        adapter,
        clock: {
          now: () => Date.parse(AS_OF),
          isoNow: () => AS_OF,
        },
        onUpstreamRequest: ({ cacheKey }) => calls.add(cacheKey),
      });

    // When
    await makeClient(coldCalls).get(request);
    await makeClient(warmCalls).get(request);

    // Then
    expect(coldCalls).toEqual(
      new Set([canonicalInsightSentryCacheKey(request)]),
    );
    expect(warmCalls.size).toBe(0);
    await rm(root, { recursive: true, force: true });
  });

  it("fails closed when required current-market data remains unavailable", async () => {
    // Given
    const root = await mkdtemp(join(tmpdir(), "insightsentry-403-"));
    const urls: string[] = [];
    const adapter: InsightSentryWireAdapter = async (request) => {
      urls.push(request.url.toString());
      return wireResponse(403, "{}");
    };

    // When
    const action = collectInsightSentryInitialEvidence({
      dataRoot: root,
      runId: RUN_ID,
      snapshotId: SNAPSHOT_ID,
      identity: {
        cik: "0001045810",
        ticker: "NVDA",
        legalName: "NVIDIA Corporation",
        exchange: "NASDAQ",
        identityHash: "a".repeat(64),
      },
      asOf: AS_OF,
      cas: new CollectionCas(),
      configuration: PROVIDER_CONFIGURATION,
      adapter,
    });

    // Then
    await expect(action).rejects.toThrow(
      "required_market_data_unavailable",
    );
    expect(new Set(urls).size).toBeGreaterThan(0);
    await rm(root, { recursive: true, force: true });
  });
});

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SnapshotEvidence } from "../application/buildSnapshot";
import type { CapabilityDisclosure } from "../domain/capabilities";
import type { EvidenceDataset, SourceLocator } from "../domain/evidenceSchemas";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import type { ArtifactCasPort, ArtifactDescriptor } from "../ports/artifacts";
import { createInsightSentryClient } from "../server/data/insightsentry/insightSentryClient";
import type { InsightSentryConfigResult } from "../server/data/insightsentry/insightSentryConfig";
import { loadInsightSentryConfig } from "../server/data/insightsentry/insightSentryConfig";
import {
  attestLicensedProviderCapability,
  commitLicensedProviderEvidence,
} from "../server/data/insightsentry/insightSentryEvidence";
import {
  createInsightSentryMarket,
  type InsightSentryBarSet,
  type InsightSentryCompanyInfo,
  type InsightSentryQuote,
} from "../server/data/insightsentry/insightSentryMarket";
import type {
  CalendarDataset,
  DocumentsDataset,
  FamilyResult,
  FundamentalsDataset,
  InsightSentryResearchFamily,
  NewsClassifier,
  NewsDataset,
  OptionsDataset,
  PeersDataset,
} from "../server/data/insightsentry/insightSentryResearchContracts";
import { createInsightSentryResearchDataAdapter } from "../server/data/insightsentry/insightSentryResearchData";
import { deriveInsightSentryTechnicalAnalysis } from "../server/data/insightsentry/insightSentryTechnical";
import type { InsightSentryWireAdapter } from "../server/data/insightsentry/insightSentryTransport";
import type { SpecialistSourceArtifact } from "../workflow/specialistRoundSqlite";

const encoder = new TextEncoder();
const PROVIDER_DOCS_URL = "https://insightsentry.com/docs";
const FUNDAMENTAL_SERIES = [
  "revenue",
  "net_income",
  "eps",
  "operating_margin",
] as const;

export type InsightSentryRequestLedgerEntry = {
  readonly cacheKey: string;
  readonly endpoint: string;
  readonly url: string;
};

export type InsightSentryInitialCollection = {
  readonly evidence: readonly SnapshotEvidence[];
  readonly sources: readonly SpecialistSourceArtifact[];
  readonly capabilities: readonly CapabilityDisclosure[];
  readonly familyStates: Readonly<
    Record<
      InsightSentryResearchFamily | "technical" | "quote",
      { readonly status: string; readonly limitation?: string }
    >
  >;
  readonly requestLedger: {
    readonly uniqueUpstreamCalls: number;
    readonly entries: readonly InsightSentryRequestLedgerEntry[];
  };
  readonly retrievedAt: string;
  readonly limitations: readonly string[];
};

type ProviderIdentity = {
  readonly cik: string;
  readonly ticker: string;
  readonly legalName: string;
  readonly exchange: string;
  readonly identityHash: string;
};

type CapturedResponse = {
  readonly cacheKey: string;
  readonly endpoint: string;
  readonly retrievedAt: string;
  readonly bytes: Uint8Array;
};

function providerCode(identity: ProviderIdentity): string | undefined {
  const exchange = identity.exchange.trim().toUpperCase();
  if (exchange.includes("NASDAQ")) return `NASDAQ:${identity.ticker}`;
  if (exchange === "NYSE") return `NYSE:${identity.ticker}`;
  if (exchange.includes("AMEX") || exchange.includes("NYSE AMERICAN"))
    return `NYSE_AMERICAN:${identity.ticker}`;
  return undefined;
}

function supportedIdentity(identity: ProviderIdentity): unknown {
  const code = providerCode(identity);
  if (code === undefined) return identity;
  const exchange = code.slice(0, code.indexOf(":"));
  return {
    ...identity,
    ticker: identity.ticker.toUpperCase(),
    exchange,
  };
}

function deterministicClassifier(): NewsClassifier {
  return async (request) => ({
    classifications: request.candidates.map((candidate) => {
      const terms =
        `${candidate.title} ${candidate.clusterFeatures.topics.join(" ")}`.toLowerCase();
      const category =
        /regulat|lawsuit|investigation|sanction|recall|breach|risk/u.test(terms)
          ? "risk"
          : /rate|inflation|economy|market|sector|index/u.test(terms)
            ? "market"
            : "company";
      return {
        candidateId: candidate.candidateId,
        eventKey: candidate.clusterId.slice(0, 160),
        category,
        relevance: 0.75,
        materiality:
          candidate.source === undefined || candidate.link === undefined
            ? "immaterial"
            : "material",
        novelty: "unique",
        direction: candidate.clusterFeatures.stance,
        horizon: "near_term",
        verificationNeed: "recommended",
      };
    }),
  });
}

function unavailable<T>(): FamilyResult<T> {
  return {
    status: "unavailable",
    limitation: "provider_unavailable",
  };
}

async function marketFamily<T>(
  operation: () => Promise<T>,
): Promise<FamilyResult<T>> {
  try {
    return { status: "available", data: await operation() };
  } catch (error) {
    if (error instanceof Error) return unavailable();
    throw error;
  }
}

function familyState<T>(result: FamilyResult<T>): {
  readonly status: string;
  readonly limitation?: string;
} {
  return result.status === "available"
    ? { status: result.status }
    : { status: result.status, limitation: result.limitation };
}

function rawBundle(
  responses: readonly CapturedResponse[],
  endpoints: ReadonlySet<string>,
): Uint8Array {
  return encoder.encode(
    JSON.stringify(
      responses
        .filter((response) => endpoints.has(response.endpoint))
        .map((response) => ({
          cacheKey: response.cacheKey,
          endpoint: response.endpoint,
          retrievedAt: response.retrievedAt,
          bodyBase64: Buffer.from(response.bytes).toString("base64"),
        })),
    ),
  );
}

function freshThrough(retrievedAt: string): string {
  return new Date(Date.parse(retrievedAt) + 5 * 60_000).toISOString();
}

async function putLedger(input: {
  readonly cas: ArtifactCasPort;
  readonly runId: string;
  readonly snapshotId: string;
  readonly value: unknown;
}): Promise<{
  readonly descriptor: ArtifactDescriptor;
  readonly bytes: Uint8Array;
}> {
  const snapshotWhitespace = [...input.snapshotId]
    .map((character) =>
      character
        .charCodeAt(0)
        .toString(2)
        .padStart(8, "0")
        .replaceAll("0", " ")
        .replaceAll("1", "\t"),
    )
    .join("");
  const bytes = encoder.encode(
    `${JSON.stringify(input.value)}\n${snapshotWhitespace}`,
  );
  const descriptor = await input.cas.put({
    artifactId: ArtifactIdSchema.parse(randomUUID()),
    runId: RunIdSchema.parse(input.runId),
    snapshotId: SnapshotIdSchema.parse(input.snapshotId),
    mediaType: "application/json",
    parentDigests: [],
    bytes,
  });
  return { descriptor, bytes };
}

export async function collectInsightSentryInitialEvidence(input: {
  readonly dataRoot: string;
  readonly runId: string;
  readonly snapshotId: string;
  readonly identity: ProviderIdentity;
  readonly asOf: string;
  readonly cas: ArtifactCasPort;
  readonly configuration?: InsightSentryConfigResult;
  readonly adapter?: InsightSentryWireAdapter;
}): Promise<InsightSentryInitialCollection> {
  const requests = new Map<string, InsightSentryRequestLedgerEntry>();
  const responses = new Map<string, CapturedResponse>();
  const configuration = input.configuration ?? loadInsightSentryConfig();
  const client = createInsightSentryClient({
    configuration,
    dataRoot: input.dataRoot,
    ...(input.adapter === undefined ? {} : { adapter: input.adapter }),
    clock: {
      now: () => Date.parse(input.asOf),
      isoNow: () => input.asOf,
    },
    onUpstreamRequest: (request) => {
      requests.set(request.cacheKey, Object.freeze(request));
    },
    onResponse: (response) => {
      responses.set(
        response.cacheKey,
        Object.freeze({
          cacheKey: response.cacheKey,
          endpoint: response.endpoint,
          retrievedAt: response.retrievedAt,
          bytes: Uint8Array.from(response.bytes),
        }),
      );
    },
  });
  const code = providerCode(input.identity);
  const market = createInsightSentryMarket(client);
  const rollout = {
    fundamentals: true,
    news: true,
    documents: true,
    calendar: true,
    peers: false,
    options: false,
  } as const;
  const research = createInsightSentryResearchDataAdapter({
    client,
    rollout,
    classifyNews: deterministicClassifier(),
    screenPeers: async () => ({
      retrievedAt: input.asOf,
      peers: [],
    }),
  });
  const unavailableTechnical = unavailable<{
    readonly company: InsightSentryCompanyInfo;
    readonly quote: InsightSentryQuote;
    readonly bars: readonly [
      InsightSentryBarSet,
      InsightSentryBarSet,
      InsightSentryBarSet,
    ];
    readonly analysis: ReturnType<typeof deriveInsightSentryTechnicalAnalysis>;
  }>();
  const technical =
    code === undefined
      ? unavailableTechnical
      : await marketFamily(async () => {
          const [company, quote, bars] = await Promise.all([
            market.companyInfo(code),
            market.quote(code),
            market.technicalBars(code),
          ]);
          return {
            company,
            quote,
            bars,
            analysis: deriveInsightSentryTechnicalAnalysis({ quote, bars }),
          };
        });
  const fundamentalsPromise: Promise<FamilyResult<FundamentalsDataset>> =
    code === undefined
      ? Promise.resolve(unavailable())
      : research.fundamentals({
          symbol: code,
          asOf: input.asOf,
          seriesIndicatorIds: FUNDAMENTAL_SERIES,
          periods: 20,
        });
  const newsPromise: Promise<FamilyResult<NewsDataset>> =
    code === undefined
      ? Promise.resolve(unavailable())
      : research.news({
          symbol: code,
          companyName: input.identity.legalName,
          asOf: input.asOf,
          existingEventKeys: [],
        });
  const documentsPromise: Promise<FamilyResult<DocumentsDataset>> =
    code === undefined
      ? Promise.resolve(unavailable())
      : research.documents({ symbol: code, asOf: input.asOf });
  const calendarPromise: Promise<FamilyResult<CalendarDataset>> =
    code === undefined
      ? Promise.resolve(unavailable())
      : research.calendar({ symbol: code, asOf: input.asOf });
  const peersPromise: Promise<FamilyResult<PeersDataset>> =
    code === undefined
      ? Promise.resolve(unavailable())
      : research.peers({ symbol: code });
  const optionsPromise: Promise<FamilyResult<OptionsDataset>> =
    code === undefined
      ? Promise.resolve(unavailable())
      : research.options({
          symbol: code,
          asOf: input.asOf,
          entitled: false,
          needed: false,
        });
  const [fundamentals, news, documents, calendar, peers, options] =
    await Promise.all([
      fundamentalsPromise,
      newsPromise,
      documentsPromise,
      calendarPromise,
      peersPromise,
      optionsPromise,
    ]);
  const captured = [...responses.values()];
  const evidence: SnapshotEvidence[] = [];
  const sources: SpecialistSourceArtifact[] = [];
  const committed = new Map<
    string,
    Awaited<ReturnType<typeof commitLicensedProviderEvidence>>
  >();

  const commit = async (
    evidenceId: string,
    dataset: EvidenceDataset,
    value: unknown,
    endpoints: readonly string[],
    unit: string,
  ): Promise<void> => {
    const matching = rawBundle(captured, new Set(endpoints));
    const retrievedAt =
      captured
        .filter((response) => endpoints.includes(response.endpoint))
        .map((response) => response.retrievedAt)
        .sort()
        .at(-1) ?? input.asOf;
    const result = await commitLicensedProviderEvidence({
      cas: input.cas,
      runId: RunIdSchema.parse(input.runId),
      snapshotId: SnapshotIdSchema.parse(input.snapshotId),
      rawBytes: matching,
      normalized: value,
      schema: z.unknown(),
      rawMediaType: "application/json",
      normalizedMediaType: "application/json",
      retrievedAt,
      freshThrough: freshThrough(retrievedAt),
      schemaVersion: "workflow-v1",
      rightsSource: "insightsentry_rapidapi",
    });
    const bytes = encoder.encode(JSON.stringify(value));
    const locator: SourceLocator = {
      kind: "licensed_provider",
      source: "insightsentry_rapidapi",
      sourceUrl: PROVIDER_DOCS_URL,
      endpoint: endpoints.join(","),
      symbol: code ?? input.identity.ticker,
      dataset,
      unit,
    };
    evidence.push({
      evidenceId,
      dataset,
      rightsSource: "insightsentry_rapidapi",
      retrievedAt,
      raw: result.raw,
      normalized: result.normalized,
      current: true,
    });
    sources.push({
      evidenceId,
      artifactId: result.normalized.artifactId,
      bytes,
      mediaType: "application/json",
      locator,
    });
    committed.set(evidenceId, result);
  };

  if (technical.status === "available") {
    await commit(
      "insightsentry:technical",
      "market_bars",
      {
        analysis: technical.data.analysis,
        coverage: technical.data.bars.map((set) => set.coverage),
        company: technical.data.company,
        quote: technical.data.quote,
        bars: technical.data.bars,
      },
      [
        "/v3/symbols/{symbol}/info",
        "/v3/symbols/quotes",
        "/v3/symbols/{symbol}/series",
      ],
      "USD",
    );
    await commit(
      "insightsentry:quote",
      "insightsentry_quote",
      technical.data.quote,
      ["/v3/symbols/quotes"],
      "USD",
    );
  }
  if (fundamentals.status === "available")
    await commit(
      "insightsentry:fundamentals",
      "insightsentry_fundamentals",
      fundamentals.data,
      ["fundamentals", "fundamentals_series"],
      "normalized indicators",
    );
  if (news.status === "available") {
    for (const category of ["company", "market", "risk"] as const) {
      const events = news.data.events.filter(
        (event) => event.category === category,
      );
      if (events.length === 0) continue;
      const keys = new Set(events.map((event) => event.eventKey));
      await commit(
        `insightsentry:news:${category}`,
        `insightsentry_news_${category}`,
        {
          ...news.data,
          events,
          excerpts: news.data.excerpts.filter((excerpt) =>
            keys.has(excerpt.eventKey),
          ),
        },
        ["news"],
        "event cards",
      );
    }
  }
  if (documents.status === "available")
    await commit(
      "insightsentry:documents",
      "insightsentry_documents",
      documents.data,
      ["document_index", "document"],
      "bounded text",
    );
  if (calendar.status === "available")
    await commit(
      "insightsentry:calendar",
      "insightsentry_calendar",
      calendar.data,
      ["calendar"],
      "events",
    );

  const entries = Object.freeze(
    [...requests.values()].sort((left, right) =>
      left.cacheKey.localeCompare(right.cacheKey),
    ),
  );
  const familyStates = Object.freeze({
    technical: familyState(technical),
    quote: familyState(technical),
    fundamentals: familyState(fundamentals),
    news: familyState(news),
    documents: familyState(documents),
    calendar: familyState(calendar),
    peers: familyState(peers),
    options: familyState(options),
  });
  const ledger = await putLedger({
    cas: input.cas,
    runId: input.runId,
    snapshotId: input.snapshotId,
    value: {
      runId: input.runId,
      uniqueUpstreamCalls: entries.length,
      entries,
      familyStates,
    },
  });
  evidence.push({
    evidenceId: "insightsentry:request-ledger",
    dataset: "insightsentry_request_ledger",
    rightsSource: "insightsentry_rapidapi",
    retrievedAt: input.asOf,
    raw: ledger.descriptor,
    current: true,
  });
  sources.push({
    evidenceId: "insightsentry:request-ledger",
    artifactId: ledger.descriptor.artifactId,
    bytes: ledger.bytes,
    mediaType: "application/json",
    locator: {
      kind: "licensed_provider",
      source: "insightsentry_rapidapi",
      sourceUrl: PROVIDER_DOCS_URL,
      endpoint: "request_ledger",
      symbol: code ?? input.identity.ticker,
      dataset: "insightsentry_request_ledger",
      unit: "unique upstream calls",
    },
  });

  const capabilities: CapabilityDisclosure[] = [];
  const identity = supportedIdentity(input.identity);
  const technicalEvidence = committed.get("insightsentry:technical");
  if (technicalEvidence !== undefined) {
    const disclosure = await attestLicensedProviderCapability({
      cas: input.cas,
      identity,
      key: "current_market_data",
      evidence: technicalEvidence,
      now: input.asOf,
    });
    if (disclosure !== undefined) capabilities.push(disclosure);
  }
  const newsEvidence =
    committed.get("insightsentry:news:company") ??
    committed.get("insightsentry:news:market") ??
    committed.get("insightsentry:news:risk");
  if (newsEvidence !== undefined) {
    const disclosure = await attestLicensedProviderCapability({
      cas: input.cas,
      identity,
      key: "professional_news",
      evidence: newsEvidence,
      now: input.asOf,
    });
    if (disclosure !== undefined) capabilities.push(disclosure);
  }
  const retrievedAt =
    captured
      .map((response) => response.retrievedAt)
      .sort()
      .at(-1) ?? input.asOf;
  const limitations = Object.entries(familyStates)
    .filter(([, state]) => state.status !== "available")
    .map(
      ([family, state]) =>
        `insightsentry_${family}_${state.limitation ?? state.status}`,
    );
  if (
    familyStates.quote.status !== "available" ||
    familyStates.technical.status !== "available"
  )
    throw new TypeError("required_market_data_unavailable");
  return Object.freeze({
    evidence: Object.freeze(evidence),
    sources: Object.freeze(sources),
    capabilities: Object.freeze(capabilities),
    familyStates,
    requestLedger: Object.freeze({
      uniqueUpstreamCalls: entries.length,
      entries,
    }),
    retrievedAt,
    limitations: Object.freeze(limitations),
  });
}

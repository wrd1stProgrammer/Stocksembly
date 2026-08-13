import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SnapshotEvidence } from "../application/buildSnapshot";
import type { CapabilityDisclosure } from "../domain/capabilities";
import type { EvidenceDataset, SourceLocator } from "../domain/evidenceSchemas";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { routeNewsForTeam } from "../domain/teamNewsRouting";
import type { ValueDraft } from "../domain/valueRegistry";
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
  type InsightSentryMarket,
  type InsightSentryQuote,
} from "../server/data/insightsentry/insightSentryMarket";
import { createInsightSentryPeerScreen } from "../server/data/insightsentry/insightSentryPeerSelection";
import type {
  CalendarDataset,
  DocumentsDataset,
  EarningsSnapshot,
  FamilyResult,
  FundamentalsDataset,
  FundamentalValue,
  InsightSentryResearchFamily,
  NewsClassifier,
  NewsDataset,
  OptionsDataset,
  PeersDataset,
} from "../server/data/insightsentry/insightSentryResearchContracts";
import { createInsightSentryResearchDataAdapter } from "../server/data/insightsentry/insightSentryResearchData";
import { createSemanticNewsClassifier } from "../server/data/insightsentry/insightSentrySemanticNewsClassifier";
import { deriveInsightSentryTechnicalAnalysis } from "../server/data/insightsentry/insightSentryTechnical";
import type { InsightSentryWireAdapter } from "../server/data/insightsentry/insightSentryTransport";
import type { SpecialistSourceArtifact } from "../workflow/specialistRoundSqlite";

const encoder = new TextEncoder();
const PROVIDER_DOCS_URL = "https://insightsentry.com/docs";
const FUNDAMENTAL_SERIES = [
  "total_revenue_fq",
  "gross_margin_fq",
  "operating_margin_fq",
  "net_income_fq",
  "earnings_per_share_diluted_fq",
  "cash_f_operating_activities_fq",
  "free_cash_flow_fq",
  "capital_expenditures_fq",
  "cash_n_short_term_invest_fq",
  "net_debt_fq",
  "total_inventory_fq",
  "accounts_receivables_net_fq",
  "diluted_shares_outstanding_fq",
  "return_on_invested_capital_fq",
  "price_earnings",
  "enterprise_value_ebitda_fq",
  "ev_revenue_fq",
  "earnings_estimate_fq",
  "sales_estimates_fq",
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
  readonly valueDrafts: readonly ValueDraft[];
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

function trailingReturn(
  daily: InsightSentryBarSet,
  sessions: number,
): number | undefined {
  const last = daily.bars.at(-1);
  const base = daily.bars.at(-(sessions + 1));
  if (last === undefined || base === undefined || base.close <= 0)
    return undefined;
  return Number(((last.close / base.close - 1) * 100).toFixed(2));
}

function performanceFromDailyBars(daily: InsightSentryBarSet): {
  readonly performance3Month?: number;
  readonly performance1Year?: number;
} {
  const performance3Month = trailingReturn(daily, 63);
  const performance1Year = trailingReturn(daily, 252);
  return Object.freeze({
    ...(performance3Month === undefined ? {} : { performance3Month }),
    ...(performance1Year === undefined ? {} : { performance1Year }),
  });
}

function mergeEarningsSnapshot(
  primary: EarningsSnapshot | undefined,
  fallback: EarningsSnapshot | undefined,
): EarningsSnapshot | undefined {
  if (primary === undefined && fallback === undefined) return undefined;
  const merged = Object.fromEntries(
    Object.entries({ ...(fallback ?? {}), ...(primary ?? {}) }).filter(
      ([, value]) => value !== undefined,
    ),
  ) as EarningsSnapshot;
  return Object.keys(merged).length === 0 ? undefined : Object.freeze(merged);
}

function mergeCalendarWithCompanyInfo(input: {
  readonly result: FamilyResult<CalendarDataset>;
  readonly company: InsightSentryCompanyInfo | undefined;
  readonly symbol: string;
  readonly companyName: string;
  readonly asOf: string;
}): FamilyResult<CalendarDataset> {
  const earnings = mergeEarningsSnapshot(
    input.result.status === "available"
      ? input.result.data.earnings
      : undefined,
    input.company?.earnings,
  );
  if (earnings === undefined) return input.result;
  const center = Date.parse(input.asOf);
  const windowStart = new Date(center - 90 * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
  const windowEnd = new Date(center + 90 * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
  const baseEvents =
    input.result.status === "available" ? input.result.data.events : [];
  const supplementalEvents = [
    earnings.latestReportAt,
    earnings.nextReportAt,
  ].flatMap((reportAt) => {
    if (reportAt === undefined) return [];
    const timestamp = Date.parse(reportAt);
    if (
      !Number.isFinite(timestamp) ||
      timestamp < Date.parse(`${windowStart}T00:00:00.000Z`) ||
      timestamp > Date.parse(`${windowEnd}T23:59:59.999Z`)
    )
      return [];
    return [
      Object.freeze({
        symbol: input.symbol,
        name: input.companyName,
        reportAt,
      }),
    ];
  });
  const events = [...baseEvents, ...supplementalEvents]
    .sort((left, right) => left.reportAt.localeCompare(right.reportAt))
    .filter(
      (event, index, all) =>
        index === 0 ||
        all[index - 1]?.reportAt !== event.reportAt ||
        all[index - 1]?.symbol !== event.symbol,
    );
  const existing =
    input.result.status === "available" ? input.result.data : undefined;
  return Object.freeze({
    status: "available",
    data: Object.freeze({
      symbol: input.symbol,
      providerUpdatedAt: existing?.providerUpdatedAt ?? input.asOf,
      retrievedAt: existing?.retrievedAt ?? input.asOf,
      pitSafe: false,
      limitations: ["provider_dataset_not_point_in_time_safe"] as const,
      windowStart: existing?.windowStart ?? windowStart,
      windowEnd: existing?.windowEnd ?? windowEnd,
      events: Object.freeze(events),
      earnings,
    }),
  });
}

function providerPeriod(value: string | undefined, fallback: string): string {
  const period = value?.trim();
  return period === undefined || period.length === 0 || period.length > 80
    ? fallback.slice(0, 10)
    : period;
}

function numericLeaves(
  value: FundamentalValue,
  prefix = "value",
): readonly { readonly path: string; readonly value: number }[] {
  if (typeof value === "number" && Number.isFinite(value))
    return [{ path: prefix, value }];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) =>
    numericLeaves(nested, `${prefix}.${key}`),
  );
}

function providerUnit(metric: string): string {
  if (/surprise_percent|growth|margin|return|change_percent/iu.test(metric))
    return "percent";
  if (/price_earnings|enterprise_value_ebitda|ev_revenue/iu.test(metric))
    return "multiple";
  if (/eps|earnings_per_share/iu.test(metric)) return "USD per share";
  if (
    /revenue|income|cash|debt|asset|capex|market_cap|last_price|price_target|inventory|receivable/iu.test(
      metric,
    )
  )
    return "USD";
  if (/shares|recommendation|estimates_num/iu.test(metric)) return "count";
  return "provider native unit";
}

function providerValueDrafts(input: {
  readonly runId: string;
  readonly snapshotId: string;
  readonly asOf: string;
  readonly technical: FamilyResult<{
    readonly company: InsightSentryCompanyInfo;
    readonly quote: InsightSentryQuote;
    readonly bars: readonly [
      InsightSentryBarSet,
      InsightSentryBarSet,
      InsightSentryBarSet,
    ];
    readonly analysis: ReturnType<typeof deriveInsightSentryTechnicalAnalysis>;
  }>;
  readonly fundamentals: FamilyResult<FundamentalsDataset>;
  readonly calendar: FamilyResult<CalendarDataset>;
}): readonly ValueDraft[] {
  const drafts: ValueDraft[] = [];
  const add = (
    metric: string,
    value: number | undefined,
    period: string | undefined,
  ): void => {
    if (value === undefined || !Number.isFinite(value)) return;
    const ordinal = drafts.length + 1;
    drafts.push({
      valueId: `insightsentry:${metric}:${ordinal}`.slice(0, 240),
      runId: input.runId,
      snapshotId: input.snapshotId,
      metric,
      value: String(value),
      unit: providerUnit(metric),
      source: "insightsentry_rapidapi",
      period: providerPeriod(period, input.asOf),
    });
  };
  if (input.technical.status === "available") {
    add(
      "provider_quote.last_price",
      input.technical.data.quote.lastPrice,
      input.technical.data.quote.observedAt,
    );
    add(
      "provider_quote.change_percent",
      input.technical.data.quote.changePercent,
      input.technical.data.quote.observedAt,
    );
  }
  if (input.fundamentals.status === "available") {
    let indicatorCount = 0;
    for (const indicator of input.fundamentals.data.indicators) {
      for (const leaf of numericLeaves(indicator.value).slice(0, 3)) {
        if (indicatorCount >= 90) break;
        add(
          `provider_fundamental.${indicator.id}.${leaf.path}`,
          leaf.value,
          indicator.period,
        );
        indicatorCount += 1;
      }
      if (indicatorCount >= 90) break;
    }
    for (const series of input.fundamentals.data.series) {
      const latest = series.points.at(-1);
      if (latest === undefined) continue;
      // biome-ignore lint/complexity/useLiteralKeys: provider series uses an index signature.
      const time = latest["time"];
      const period =
        time === undefined
          ? input.asOf
          : new Date(
              time >= 100_000_000_000 ? time : time * 1_000,
            ).toISOString();
      for (const [key, value] of Object.entries(latest)) {
        if (key === "time") continue;
        add(`provider_fundamental.${series.id}.${key}`, value, period);
      }
    }
  }
  const earnings =
    input.calendar.status === "available"
      ? input.calendar.data.earnings
      : undefined;
  if (earnings !== undefined) {
    const latestPeriod = earnings.latestReportAt ?? input.asOf;
    const nextPeriod = earnings.nextReportAt ?? input.asOf;
    add("provider_earnings.eps_actual", earnings.epsActual, latestPeriod);
    add("provider_earnings.eps_forecast", earnings.epsForecast, latestPeriod);
    add("provider_earnings.eps_surprise", earnings.epsSurprise, latestPeriod);
    add(
      "provider_earnings.eps_surprise_percent",
      earnings.epsSurprisePercent,
      latestPeriod,
    );
    add(
      "provider_earnings.next_eps_forecast",
      earnings.nextEpsForecast,
      nextPeriod,
    );
    add(
      "provider_earnings.revenue_actual",
      earnings.revenueActual,
      latestPeriod,
    );
    add(
      "provider_earnings.revenue_forecast",
      earnings.revenueForecast,
      latestPeriod,
    );
    add(
      "provider_earnings.revenue_surprise",
      earnings.revenueSurprise,
      latestPeriod,
    );
    add(
      "provider_earnings.revenue_surprise_percent",
      earnings.revenueSurprisePercent,
      latestPeriod,
    );
    add(
      "provider_earnings.next_revenue_forecast",
      earnings.nextRevenueForecast,
      nextPeriod,
    );
  }
  return Object.freeze(drafts);
}

async function enrichPeersWithCachedHistory(input: {
  readonly result: FamilyResult<PeersDataset>;
  readonly market: InsightSentryMarket;
  readonly subjectDaily?: InsightSentryBarSet;
}): Promise<FamilyResult<PeersDataset>> {
  if (input.result.status !== "available") return input.result;
  const subjectPerformance =
    input.subjectDaily === undefined
      ? {}
      : performanceFromDailyBars(input.subjectDaily);
  const peers = await Promise.all(
    input.result.data.peers.map(async (peer) => {
      if (
        peer.performance3Month !== undefined &&
        peer.performance1Year !== undefined
      )
        return peer;
      try {
        const performance = performanceFromDailyBars(
          await input.market.comparisonDailyBars(peer.symbol),
        );
        return Object.freeze({
          ...peer,
          ...(peer.performance3Month !== undefined
            ? {}
            : performance.performance3Month === undefined
              ? {}
              : { performance3Month: performance.performance3Month }),
          ...(peer.performance1Year !== undefined
            ? {}
            : performance.performance1Year === undefined
              ? {}
              : { performance1Year: performance.performance1Year }),
        });
      } catch (error) {
        if (error instanceof Error) return peer;
        throw error;
      }
    }),
  );
  const subject = Object.freeze({
    ...input.result.data.subject,
    ...(input.result.data.subject.performance3Month !== undefined
      ? {}
      : subjectPerformance.performance3Month === undefined
        ? {}
        : { performance3Month: subjectPerformance.performance3Month }),
    ...(input.result.data.subject.performance1Year !== undefined
      ? {}
      : subjectPerformance.performance1Year === undefined
        ? {}
        : { performance1Year: subjectPerformance.performance1Year }),
  });
  return Object.freeze({
    status: "available",
    data: Object.freeze({
      ...input.result.data,
      subject,
      peers: Object.freeze(peers),
    }),
  });
}

async function marketFamily<T>(
  operation: () => Promise<T>,
  required = false,
): Promise<FamilyResult<T>> {
  try {
    return { status: "available", data: await operation() };
  } catch (error) {
    if (required && error instanceof Error) throw error;
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
  readonly peerProfile?: {
    readonly annualAccessionNumber: string;
    readonly annualText: string;
  };
  readonly requestedComparisonSymbols?: readonly string[];
  readonly question?: string;
  readonly investmentHorizon?: "short" | "medium" | "long";
  readonly analysisDepth?: "core" | "standard" | "deep";
  readonly decisionPurpose?:
    | "new_entry"
    | "holding_review"
    | "position_sizing"
    | "earnings";
  readonly configuration?: InsightSentryConfigResult;
  readonly adapter?: InsightSentryWireAdapter;
}): Promise<InsightSentryInitialCollection> {
  const requests = new Map<string, InsightSentryRequestLedgerEntry>();
  const responses = new Map<string, CapturedResponse>();
  const configuration = input.configuration ?? loadInsightSentryConfig();
  if (configuration.status === "not_configured")
    throw new TypeError(
      `required_market_data_not_configured:${configuration.reason}`,
    );
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
  const requestedComparisonSymbols = [
    ...new Set(
      (input.requestedComparisonSymbols ?? []).map((symbol) =>
        symbol.toUpperCase(),
      ),
    ),
  ].slice(0, 5);
  const market = createInsightSentryMarket(client);
  const rollout = {
    fundamentals: true,
    news: true,
    documents: true,
    calendar: true,
    // A peer set is useful even when the user does not manually name a
    // comparator. The selector uses the latest annual filing, keeps its own
    // 30-day selection cache, and merges explicit user choices when present.
    peers: input.peerProfile !== undefined,
    options: false,
  } as const;
  const research = createInsightSentryResearchDataAdapter({
    client,
    rollout,
    dataRoot: input.dataRoot,
    classifyNews:
      input.adapter === undefined
        ? createSemanticNewsClassifier()
        : deterministicClassifier(),
    screenPeers:
      input.peerProfile === undefined
        ? async () => {
            throw new TypeError("peer profile unavailable");
          }
        : createInsightSentryPeerScreen({
            client,
            dataRoot: input.dataRoot,
            asOf: input.asOf,
            annualAccessionNumber: input.peerProfile.annualAccessionNumber,
            annualText: input.peerProfile.annualText,
            requestedSymbols: requestedComparisonSymbols,
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
  const technicalPromise =
    code === undefined
      ? Promise.resolve(unavailableTechnical)
      : marketFamily(async () => {
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
        }, true);
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
          collectionMode: "research",
          researchContext: {
            question:
              input.question ??
              `Evaluate the investment case for ${input.identity.ticker}.`,
            investmentHorizon: input.investmentHorizon ?? "medium",
            analysisDepth: input.analysisDepth ?? "standard",
            decisionPurpose: input.decisionPurpose ?? "new_entry",
          },
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
  const [
    technical,
    fundamentals,
    news,
    documents,
    collectedCalendar,
    collectedPeers,
    options,
  ] = await Promise.all([
    technicalPromise,
    fundamentalsPromise,
    newsPromise,
    documentsPromise,
    calendarPromise,
    peersPromise,
    optionsPromise,
  ]);
  const calendar = mergeCalendarWithCompanyInfo({
    result: collectedCalendar,
    company:
      technical.status === "available" ? technical.data.company : undefined,
    symbol: code ?? input.identity.ticker,
    companyName: input.identity.legalName,
    asOf: input.asOf,
  });
  const subjectDaily =
    technical.status === "available"
      ? technical.data.bars.find((candidate) => candidate.timeframe === "1d")
      : undefined;
  const peers = await enrichPeersWithCachedHistory({
    result: collectedPeers,
    market,
    ...(subjectDaily === undefined ? {} : { subjectDaily }),
  });
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
    for (const category of [
      "company",
      "market",
      "financial",
      "risk",
    ] as const) {
      const routed = routeNewsForTeam({ dataset: news.data, team: category });
      if (routed.events.length === 0) continue;
      await commit(
        `insightsentry:news:${category}`,
        `insightsentry_news_${category}`,
        routed,
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
      ["calendar", "/v3/symbols/{symbol}/info"],
      "earnings events, actuals, and estimates",
    );
  if (peers.status === "available")
    await commit(
      "insightsentry:peers",
      "insightsentry_peers",
      peers.data,
      ["stock_screener", "/v3/symbols/{symbol}/series"],
      "relative valuation and return metrics",
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
    committed.get("insightsentry:news:financial") ??
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
  const fundamentalsHaveConsensus =
    fundamentals.status === "available" &&
    fundamentals.data.indicators.some((indicator) =>
      /forecast|estimate|price_target|recommendation|consensus/iu.test(
        indicator.id,
      ),
    );
  const calendarHasConsensus =
    calendar.status === "available" &&
    calendar.data.earnings !== undefined &&
    [
      calendar.data.earnings.epsForecast,
      calendar.data.earnings.nextEpsForecast,
      calendar.data.earnings.revenueForecast,
      calendar.data.earnings.nextRevenueForecast,
    ].some((value) => value !== undefined);
  const consensusEvidence = fundamentalsHaveConsensus
    ? committed.get("insightsentry:fundamentals")
    : calendarHasConsensus
      ? committed.get("insightsentry:calendar")
      : undefined;
  if (consensusEvidence !== undefined) {
    const disclosure = await attestLicensedProviderCapability({
      cas: input.cas,
      identity,
      key: "consensus",
      evidence: consensusEvidence,
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
    valueDrafts: providerValueDrafts({
      runId: input.runId,
      snapshotId: input.snapshotId,
      asOf: input.asOf,
      technical,
      fundamentals,
      calendar,
    }),
    familyStates,
    requestLedger: Object.freeze({
      uniqueUpstreamCalls: entries.length,
      entries,
    }),
    retrievedAt,
    limitations: Object.freeze(limitations),
  });
}

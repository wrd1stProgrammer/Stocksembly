import { ZodError } from "zod";
import {
  type InsightSentryClient,
  InsightSentryClientError,
} from "./insightSentryClient";
import { clusterNewsCandidates } from "./insightSentryNewsClustering";
import {
  readNewsCandidateClassifications,
  readNewsEventLedger,
  type StoredNewsEvent,
  writeNewsCandidateClassifications,
  writeNewsEventLedger,
} from "./insightSentryNewsLedger";
import {
  type CandidateWithContent,
  classifyNewsCandidatePool,
  deduplicateNewsItems,
  MAX_NEWS_EXCERPT_CHARACTERS,
} from "./insightSentryNewsSelection";
import type {
  FamilyResult,
  InsightSentryResearchDataAdapter,
  InsightSentryResearchRollout,
  NewsClassifier,
  NewsDataset,
  NewsEventCard,
  NewsExcerpt,
} from "./insightSentryResearchContracts";
import type { NewsClassification } from "./insightSentryResearchSchemas";
import { NewsResponseSchema } from "./insightSentryResearchSchemas";
import {
  familyFailure,
  isoDate,
  pitUnsafeTimestamps,
  unixSecondsToIso,
  withheldWhenDisabled,
} from "./insightSentryResearchSupport";

const MINUTE = 60 * 1_000;
const DAY = 24 * 60 * MINUTE;
const RECENT_NEWS_TTL = 15 * MINUTE;
const ARCHIVE_NEWS_TTL = 12 * 60 * MINUTE;
const LONG_ARCHIVE_NEWS_TTL = 24 * 60 * MINUTE;
const BRIEFING_RAW_LIMIT = 20;
const RESEARCH_RECENT_RAW_LIMIT = 100;
const RESEARCH_ARCHIVE_RAW_LIMIT = 100;
const MAX_RESEARCH_EVENTS = 16;
const MAX_LEGACY_EVENTS = 20;

type NewsInput = Parameters<InsightSentryResearchDataAdapter["news"]>[0] & {
  readonly client: InsightSentryClient;
  readonly rollout: InsightSentryResearchRollout;
  readonly classifyNews: NewsClassifier;
  readonly dataRoot?: string;
};

type FetchedWindow = {
  readonly providerUpdatedAt: number;
  readonly retrievedAt: string;
  readonly rawItemCount: number;
  readonly candidates: readonly CandidateWithContent[];
};

const FINANCIAL_TERMS =
  /earnings?|guidance|outlook|forecast|revenue|sales|margin|profit|eps|cash flow|free cash|dividend|buyback|repurchase|capital expenditure|capex|debt|financing|acquisition|merger|실적|가이던스|전망|매출|마진|이익|현금흐름|배당|자사주|인수|합병/iu;
const COMPANY_TERMS =
  /product|launch|customer|contract|order|shipment|production|factory|pricing|partnership|supplier|demand|market share|제품|출시|고객|계약|수주|출하|생산|공장|가격|파트너십|공급사|수요|점유율/iu;
const RISK_TERMS =
  /regulat|lawsuit|investigation|probe|sanction|recall|breach|tariff|ban|restriction|shortage|delay|default|fraud|규제|소송|조사|제재|리콜|침해|관세|금지|제한|부족|지연|부도|사기/iu;
const MARKET_TERMS =
  /premarket|after.?hours|analyst|price target|rating|sector|index|yield|rate|inflation|volume|shares? (?:rise|fall|jump|drop)|장전|시간외|애널리스트|목표주가|등급|섹터|지수|금리|물가|거래량/iu;
const STRUCTURAL_TERMS = new RegExp(
  `${FINANCIAL_TERMS.source}|${COMPANY_TERMS.source}|${RISK_TERMS.source}|management|ceo|cfo|strategy|restructur|경영진|전략|구조조정`,
  "iu",
);
const LOW_SIGNAL_TERMS =
  /market roundup|stocks? to watch|top stocks?|stock market today|weekly recap|trending stocks?|장 마감 종합|오늘의 종목|주목할 종목/iu;
const MATERIAL_ACTION_TERMS = new RegExp(
  `${FINANCIAL_TERMS.source}|${COMPANY_TERMS.source}|${RISK_TERMS.source}`,
  "iu",
);

function windowDates(asOf: string, startDaysAgo: number, endDaysAgo: number) {
  const end = new Date(asOf);
  end.setUTCDate(end.getUTCDate() - endDaysAgo);
  const start = new Date(asOf);
  start.setUTCDate(start.getUTCDate() - startDaysAgo);
  return Object.freeze({ from: isoDate(start), to: isoDate(end) });
}

function instantDaysAgo(asOf: string, days: number): string {
  return new Date(Date.parse(asOf) - days * DAY).toISOString();
}

function teamRelevance(
  category: NewsEventCard["category"],
  candidate: CandidateWithContent,
): NewsEventCard["teamRelevance"] {
  const text = `${candidate.title} ${candidate.excerpt ?? ""}`;
  const teams = new Set<NewsEventCard["teamRelevance"][number]>([category]);
  if (FINANCIAL_TERMS.test(text)) teams.add("financial");
  if (COMPANY_TERMS.test(text) || FINANCIAL_TERMS.test(text))
    teams.add("company");
  if (RISK_TERMS.test(text)) teams.add("risk");
  if (MARKET_TERMS.test(text)) teams.add("market");
  return Object.freeze([...teams]);
}

function eligibleCandidates(
  candidates: readonly CandidateWithContent[],
): readonly CandidateWithContent[] {
  return candidates.filter((candidate) => {
    if (candidate.source === undefined || candidate.link === undefined)
      return false;
    return (
      !LOW_SIGNAL_TERMS.test(candidate.title) ||
      MATERIAL_ACTION_TERMS.test(
        `${candidate.title} ${candidate.excerpt ?? ""}`,
      )
    );
  });
}

function selectedWindowEvents(input: {
  readonly candidates: readonly CandidateWithContent[];
  readonly classifications: readonly NewsClassification[];
}): {
  readonly events: readonly NewsEventCard[];
  readonly excerpts: readonly NewsExcerpt[];
} {
  const byId = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const seen = new Set<string>();
  const events = input.classifications
    .filter(
      (classification) =>
        classification.materiality === "material" &&
        classification.novelty === "unique",
    )
    .sort(
      (left, right) =>
        right.relevance - left.relevance ||
        left.eventKey.localeCompare(right.eventKey) ||
        left.direction.localeCompare(right.direction),
    )
    .flatMap((classification) => {
      const candidate = byId.get(classification.candidateId);
      if (candidate === undefined) return [];
      const key = `${classification.eventKey}|${classification.direction}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        Object.freeze({
          eventKey: classification.eventKey,
          category: classification.category,
          teamRelevance: teamRelevance(classification.category, candidate),
          relevance: classification.relevance,
          direction: classification.direction,
          horizon: classification.horizon,
          verificationNeed: classification.verificationNeed,
          title: candidate.title,
          publishedAt: candidate.publishedAt,
          ...(candidate.source === undefined
            ? {}
            : { source: candidate.source }),
          ...(candidate.link === undefined ? {} : { link: candidate.link }),
        }) satisfies NewsEventCard,
      ];
    });
  const excerpts: NewsExcerpt[] = [];
  const seenExcerpt = new Set<string>();
  for (const classification of input.classifications) {
    const content = byId.get(classification.candidateId)?.content;
    const excerptKey = `${classification.eventKey}|${classification.candidateId}`;
    if (
      content !== undefined &&
      events.some((event) => event.eventKey === classification.eventKey) &&
      !seenExcerpt.has(excerptKey)
    ) {
      seenExcerpt.add(excerptKey);
      excerpts.push(
        Object.freeze({
          eventKey: classification.eventKey,
          content: content.slice(0, MAX_NEWS_EXCERPT_CHARACTERS),
        }),
      );
    }
  }
  return {
    events: Object.freeze(events),
    excerpts: Object.freeze(excerpts),
  };
}

function tokenSet(value: string): ReadonlySet<string> {
  return new Set(
    value
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .split(/[^\p{L}\p{N}]+/u)
      .filter(
        (token) =>
          token.length >= 3 &&
          !new Set([
            "the",
            "and",
            "for",
            "with",
            "from",
            "that",
            "this",
            "대한",
            "어떻게",
            "분석",
            "투자",
          ]).has(token),
      ),
  );
}

function eventScore(input: {
  readonly event: NewsEventCard;
  readonly excerpt?: string;
  readonly asOf: string;
  readonly context: NonNullable<NewsInput["researchContext"]>;
}): number {
  const ageDays = Math.max(
    0,
    (Date.parse(input.asOf) - Date.parse(input.event.publishedAt)) / DAY,
  );
  const question = tokenSet(input.context.question);
  const eventTerms = tokenSet(`${input.event.title} ${input.excerpt ?? ""}`);
  const overlap = [...question].filter((term) => eventTerms.has(term)).length;
  let score = input.event.relevance + Math.min(0.3, overlap * 0.08);
  if (ageDays <= 1) score += 0.24;
  else if (ageDays <= 7) score += 0.14;
  else if (ageDays <= 30) score += 0.05;
  if (
    input.context.investmentHorizon === "long" &&
    (input.event.horizon === "long_term" ||
      STRUCTURAL_TERMS.test(`${input.event.title} ${input.excerpt ?? ""}`))
  )
    score += 0.24;
  if (
    input.context.decisionPurpose === "earnings" &&
    FINANCIAL_TERMS.test(`${input.event.title} ${input.excerpt ?? ""}`)
  )
    score += 0.28;
  if (input.event.verificationNeed === "required") score -= 0.04;
  return score;
}

function researchSelection(input: {
  readonly stored: readonly StoredNewsEvent[];
  readonly asOf: string;
  readonly context: NonNullable<NewsInput["researchContext"]>;
  readonly existingEventKeys: ReadonlySet<string>;
}): {
  readonly events: readonly NewsEventCard[];
  readonly excerpts: readonly NewsExcerpt[];
} {
  const limit =
    input.context.analysisDepth === "core"
      ? 8
      : input.context.analysisDepth === "deep"
        ? MAX_RESEARCH_EVENTS
        : 12;
  const unique = new Map<string, StoredNewsEvent>();
  for (const stored of input.stored) {
    if (input.existingEventKeys.has(stored.event.eventKey)) continue;
    const ageDays =
      (Date.parse(input.asOf) - Date.parse(stored.event.publishedAt)) / DAY;
    if (
      input.context.investmentHorizon === "long" &&
      ageDays > 30 &&
      !STRUCTURAL_TERMS.test(
        `${stored.event.title} ${stored.excerpt?.content ?? ""}`,
      )
    )
      continue;
    const key = `${stored.event.eventKey}|${stored.event.direction}`;
    const previous = unique.get(key);
    if (
      previous === undefined ||
      Date.parse(stored.event.publishedAt) >
        Date.parse(previous.event.publishedAt)
    )
      unique.set(key, stored);
  }
  const selected = [...unique.values()]
    .sort(
      (left, right) =>
        eventScore({
          event: right.event,
          ...(right.excerpt === undefined
            ? {}
            : { excerpt: right.excerpt.content }),
          asOf: input.asOf,
          context: input.context,
        }) -
          eventScore({
            event: left.event,
            ...(left.excerpt === undefined
              ? {}
              : { excerpt: left.excerpt.content }),
            asOf: input.asOf,
            context: input.context,
          }) || right.event.publishedAt.localeCompare(left.event.publishedAt),
    )
    .slice(0, limit);
  return {
    events: Object.freeze(selected.map((item) => item.event)),
    excerpts: Object.freeze(
      selected.flatMap((item) =>
        item.excerpt === undefined ? [] : [item.excerpt],
      ),
    ),
  };
}

export async function collectInsightSentryNews(
  input: NewsInput,
): Promise<FamilyResult<NewsDataset>> {
  const disabled = withheldWhenDisabled<NewsDataset>(input.rollout, "news");
  if (disabled !== undefined) return disabled;
  try {
    const researchMode =
      input.collectionMode === "research" &&
      input.researchContext !== undefined;
    const briefingMode = input.collectionMode === "briefing";
    const recentDays = researchMode
      ? 7
      : Math.min(7, Math.max(1, input.recentDays ?? 7));
    const allowArchiveFallback = input.allowArchiveFallback ?? true;
    let providerCalls = 0;
    let rawItemCount = 0;
    let providerUpdatedAt = 0;
    let retrievedAt = input.asOf;

    const fetchWindow = async (inputWindow: {
      readonly startDaysAgo: number;
      readonly endDaysAgo: number;
      readonly limit: number;
      readonly ttl: number;
    }): Promise<FetchedWindow> => {
      const window = windowDates(
        input.asOf,
        inputWindow.startDaysAgo,
        inputWindow.endDaysAgo,
      );
      const response = await input.client.get({
        endpoint: "news",
        pathSegments: ["newsfeed"],
        parameters: {
          related_symbols: input.symbol,
          limit: inputWindow.limit,
          page: 1,
          archive: inputWindow.startDaysAgo > 7,
          from: window.from,
          to: window.to,
        },
        asOfBucket: window.to,
        schema: NewsResponseSchema,
        cacheTtlMilliseconds: inputWindow.ttl,
      });
      providerCalls += 1;
      const rawItems = response.data.data.slice(0, inputWindow.limit);
      rawItemCount += rawItems.length;
      providerUpdatedAt = Math.max(
        providerUpdatedAt,
        response.data.last_update,
      );
      if (response.retrievedAt.localeCompare(retrievedAt) > 0)
        retrievedAt = response.retrievedAt;
      const candidates = eligibleCandidates(
        clusterNewsCandidates(deduplicateNewsItems(rawItems)),
      );
      return Object.freeze({
        providerUpdatedAt: response.data.last_update,
        retrievedAt: response.retrievedAt,
        rawItemCount: rawItems.length,
        candidates,
      });
    };

    const classifyWindows = async (
      windows: readonly FetchedWindow[],
    ): Promise<{
      readonly events: readonly NewsEventCard[];
      readonly excerpts: readonly NewsExcerpt[];
    }> => {
      const candidateById = new Map<string, CandidateWithContent>();
      for (const candidate of windows.flatMap((window) => window.candidates))
        if (!candidateById.has(candidate.candidateId))
          candidateById.set(candidate.candidateId, candidate);
      const candidates = [...candidateById.values()];
      const cached = await readNewsCandidateClassifications({
        ...(input.dataRoot === undefined ? {} : { dataRoot: input.dataRoot }),
        symbol: input.symbol,
        candidateIds: candidates.map((candidate) => candidate.candidateId),
      });
      const cachedIds = new Set(cached.map((item) => item.candidateId));
      const unclassified = candidates.filter(
        (candidate) => !cachedIds.has(candidate.candidateId),
      );
      const classified = await classifyNewsCandidatePool(
        input.classifyNews,
        unclassified,
      );
      await writeNewsCandidateClassifications({
        ...(input.dataRoot === undefined ? {} : { dataRoot: input.dataRoot }),
        symbol: input.symbol,
        classifiedAt: input.asOf,
        publishedAtByCandidateId: new Map(
          unclassified.map((candidate) => [
            candidate.candidateId,
            candidate.publishedAt,
          ]),
        ),
        detailed: classified.classifications,
        screenedOut: classified.screenedOut,
      });
      const classifications = [
        ...cached.flatMap((item) =>
          item.status === "detailed" ? [item.classification] : [],
        ),
        ...classified.classifications,
      ];
      return selectedWindowEvents({ candidates, classifications });
    };

    const recentWindow = {
      startDaysAgo: recentDays,
      endDaysAgo: 0,
      limit: researchMode
        ? RESEARCH_RECENT_RAW_LIMIT
        : briefingMode
          ? BRIEFING_RAW_LIMIT
          : 20,
      ttl: RECENT_NEWS_TTL,
    } as const;

    let cachedHistory: readonly StoredNewsEvent[] = [];
    const researchWindows: {
      readonly startDaysAgo: number;
      readonly endDaysAgo: number;
      readonly limit: number;
      readonly ttl: number;
    }[] = [recentWindow];
    if (researchMode) {
      const context = input.researchContext;
      const needsMediumHistory =
        context.investmentHorizon !== "short" ||
        context.decisionPurpose === "earnings";
      const needsLongHistory = context.investmentHorizon === "long";
      const mediumHistory = needsMediumHistory
        ? await readNewsEventLedger({
            ...(input.dataRoot === undefined
              ? {}
              : { dataRoot: input.dataRoot }),
            symbol: input.symbol,
            from: instantDaysAgo(input.asOf, 30),
            to: instantDaysAgo(input.asOf, 7),
          })
        : [];
      const longHistory = needsLongHistory
        ? await readNewsEventLedger({
            ...(input.dataRoot === undefined
              ? {}
              : { dataRoot: input.dataRoot }),
            symbol: input.symbol,
            from: instantDaysAgo(input.asOf, 180),
            to: instantDaysAgo(input.asOf, 30),
          })
        : [];
      cachedHistory = [...mediumHistory, ...longHistory];
      if (needsMediumHistory && mediumHistory.length < 5)
        researchWindows.push({
          startDaysAgo: 30,
          endDaysAgo: 8,
          limit: RESEARCH_ARCHIVE_RAW_LIMIT,
          ttl: ARCHIVE_NEWS_TTL,
        });
      if (needsLongHistory && longHistory.length < 5)
        researchWindows.push({
          startDaysAgo: 180,
          endDaysAgo: 31,
          limit: RESEARCH_ARCHIVE_RAW_LIMIT,
          ttl: LONG_ARCHIVE_NEWS_TTL,
        });
    }

    const fetchedWindows = researchMode
      ? await Promise.all(researchWindows.map(fetchWindow))
      : [await fetchWindow(recentWindow)];
    let fresh = await classifyWindows(fetchedWindows);
    const recentHasUniqueMaterial = fresh.events.some(
      (event) => !input.existingEventKeys.includes(event.eventKey),
    );
    if (!researchMode && !recentHasUniqueMaterial && allowArchiveFallback) {
      const archive = await fetchWindow({
        startDaysAgo: 30,
        endDaysAgo: recentDays + 1,
        limit: briefingMode ? BRIEFING_RAW_LIMIT : 20,
        ttl: ARCHIVE_NEWS_TTL,
      });
      const archiveClassified = await classifyWindows([archive]);
      fresh = {
        events: [...fresh.events, ...archiveClassified.events],
        excerpts: [...fresh.excerpts, ...archiveClassified.excerpts],
      };
    }

    const freshEvents = fresh.events;
    const freshExcerpts = fresh.excerpts;
    await writeNewsEventLedger({
      ...(input.dataRoot === undefined ? {} : { dataRoot: input.dataRoot }),
      symbol: input.symbol,
      observedAt: input.asOf,
      events: freshEvents,
      excerpts: freshExcerpts,
    });

    const selected = researchMode
      ? researchSelection({
          stored: [
            ...freshEvents.map((event) => ({
              event,
              ...(() => {
                const excerpt = freshExcerpts.find(
                  (candidate) => candidate.eventKey === event.eventKey,
                );
                return excerpt === undefined ? {} : { excerpt };
              })(),
            })),
            ...cachedHistory,
          ],
          asOf: input.asOf,
          context: input.researchContext,
          existingEventKeys: new Set(input.existingEventKeys),
        })
      : (() => {
          const existing = new Set(input.existingEventKeys);
          const events = freshEvents
            .filter((event) => !existing.has(event.eventKey))
            .slice(0, MAX_LEGACY_EVENTS);
          const keys = new Set(events.map((event) => event.eventKey));
          return {
            events,
            excerpts: freshExcerpts.filter((excerpt) =>
              keys.has(excerpt.eventKey),
            ),
          };
        })();

    return Object.freeze({
      status: "available",
      data: Object.freeze({
        symbol: input.symbol,
        ...pitUnsafeTimestamps(
          unixSecondsToIso(providerUpdatedAt),
          retrievedAt,
        ),
        providerCalls,
        rawItemCount,
        events: selected.events,
        excerpts: selected.excerpts,
        providerEvidence: selected.events.flatMap((event) =>
          event.link === undefined ? [] : [event.link],
        ),
      }),
    });
  } catch (error) {
    if (error instanceof InsightSentryClientError || error instanceof ZodError)
      return familyFailure(error);
    throw error;
  }
}

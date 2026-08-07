import { ZodError } from "zod";
import {
  type InsightSentryClient,
  InsightSentryClientError,
} from "./insightSentryClient";
import { clusterNewsCandidates } from "./insightSentryNewsClustering";
import {
  classifyNewsCandidates,
  deduplicateNewsItems,
  MAX_NEWS_EXCERPT_CHARACTERS,
} from "./insightSentryNewsSelection";
import type {
  FamilyResult,
  InsightSentryResearchRollout,
  NewsClassifier,
  NewsDataset,
} from "./insightSentryResearchContracts";
import { NewsResponseSchema } from "./insightSentryResearchSchemas";
import {
  familyFailure,
  isoDate,
  pitUnsafeTimestamps,
  unixSecondsToIso,
  withheldWhenDisabled,
} from "./insightSentryResearchSupport";

const NEWS_TTL = 15 * 60 * 1_000;
const MAX_RAW_ITEMS = 20;
const MAX_WINDOW_ITEMS = 20;
const MAX_EVENTS = 20;
const MAX_EXCERPTS = 8;

function windowDates(asOf: string, startDaysAgo: number, endDaysAgo: number) {
  const end = new Date(asOf);
  end.setUTCDate(end.getUTCDate() - endDaysAgo);
  const start = new Date(asOf);
  start.setUTCDate(start.getUTCDate() - startDaysAgo);
  return Object.freeze({ from: isoDate(start), to: isoDate(end) });
}

export async function collectInsightSentryNews(input: {
  readonly client: InsightSentryClient;
  readonly rollout: InsightSentryResearchRollout;
  readonly classifyNews: NewsClassifier;
  readonly symbol: string;
  readonly companyName: string;
  readonly asOf: string;
  readonly existingEventKeys: readonly string[];
  readonly recentDays?: number;
  readonly allowArchiveFallback?: boolean;
}): Promise<FamilyResult<NewsDataset>> {
  const disabled = withheldWhenDisabled<NewsDataset>(input.rollout, "news");
  if (disabled !== undefined) return disabled;
  try {
    const recentDays = Math.min(7, Math.max(1, input.recentDays ?? 7));
    const allowArchiveFallback = input.allowArchiveFallback ?? true;
    const requestWindow = async (startDaysAgo: number, endDaysAgo: number) => {
      const window = windowDates(input.asOf, startDaysAgo, endDaysAgo);
      return await input.client.get({
        endpoint: "news",
        pathSegments: ["newsfeed"],
        parameters: {
          related_symbols: input.symbol,
          limit: MAX_WINDOW_ITEMS,
          page: 1,
          archive: startDaysAgo > 7,
          from: window.from,
          to: window.to,
        },
        asOfBucket: window.to,
        schema: NewsResponseSchema,
        cacheTtlMilliseconds: NEWS_TTL,
      });
    };
    const recent = await requestWindow(recentDays, 0);
    let rawItems = recent.data.data.slice(0, MAX_WINDOW_ITEMS);
    let candidates = clusterNewsCandidates(deduplicateNewsItems(rawItems));
    let classifications = await classifyNewsCandidates(
      input.classifyNews,
      candidates,
    );
    const eligibleIds = new Set(
      candidates
        .filter(
          (candidate) =>
            candidate.source !== undefined && candidate.link !== undefined,
        )
        .map((candidate) => candidate.candidateId),
    );
    const existingKeys = new Set(input.existingEventKeys);
    const hasUniqueMaterial = classifications.some(
      (classification) =>
        classification.materiality === "material" &&
        classification.novelty === "unique" &&
        eligibleIds.has(classification.candidateId) &&
        !existingKeys.has(classification.eventKey),
    );
    let calls: 1 | 2 = 1;
    let providerUpdatedAt = recent.data.last_update;
    let retrievedAt = recent.retrievedAt;
    if (!hasUniqueMaterial && allowArchiveFallback) {
      const older = await requestWindow(30, recentDays + 1);
      calls = 2;
      rawItems = older.data.data.slice(0, MAX_RAW_ITEMS);
      candidates = clusterNewsCandidates(deduplicateNewsItems(rawItems));
      classifications = await classifyNewsCandidates(
        input.classifyNews,
        candidates,
      );
      providerUpdatedAt = Math.max(providerUpdatedAt, older.data.last_update);
      retrievedAt =
        older.retrievedAt.localeCompare(retrievedAt) > 0
          ? older.retrievedAt
          : retrievedAt;
    }
    const byId = new Map(
      candidates.map((candidate) => [candidate.candidateId, candidate]),
    );
    const clustered = new Set<string>();
    const events = classifications
      .filter(
        (classification) =>
          classification.materiality === "material" &&
          classification.novelty === "unique" &&
          !existingKeys.has(classification.eventKey),
      )
      .sort(
        (left, right) =>
          right.relevance - left.relevance ||
          left.eventKey.localeCompare(right.eventKey) ||
          left.direction.localeCompare(right.direction),
      )
      .filter((classification) => {
        const key = `${classification.eventKey}|${classification.direction}`;
        if (clustered.has(key)) return false;
        clustered.add(key);
        return true;
      })
      .flatMap((classification) => {
        const candidate = byId.get(classification.candidateId);
        if (
          candidate === undefined ||
          candidate.source === undefined ||
          candidate.link === undefined
        )
          return [];
        return [
          Object.freeze({
            eventKey: classification.eventKey,
            category: classification.category,
            relevance: classification.relevance,
            direction: classification.direction,
            horizon: classification.horizon,
            verificationNeed: classification.verificationNeed,
            title: candidate.title,
            publishedAt: candidate.publishedAt,
            source: candidate.source,
            link: candidate.link,
          }),
        ];
      })
      .slice(0, MAX_EVENTS);
    const selectedKeys = new Set(events.map((event) => event.eventKey));
    const excerpts = classifications
      .filter((classification) => selectedKeys.has(classification.eventKey))
      .flatMap((classification) => {
        const content = byId.get(classification.candidateId)?.content;
        return content === undefined
          ? []
          : [
              Object.freeze({
                eventKey: classification.eventKey,
                content: content.slice(0, MAX_NEWS_EXCERPT_CHARACTERS),
              }),
            ];
      })
      .slice(0, MAX_EXCERPTS);
    return Object.freeze({
      status: "available",
      data: Object.freeze({
        symbol: input.symbol,
        ...pitUnsafeTimestamps(
          unixSecondsToIso(providerUpdatedAt),
          retrievedAt,
        ),
        providerCalls: calls,
        rawItemCount: rawItems.length,
        events,
        excerpts,
        providerEvidence: events.map((event) => event.link),
      }),
    });
  } catch (error) {
    if (error instanceof InsightSentryClientError || error instanceof ZodError)
      return familyFailure(error);
    throw error;
  }
}

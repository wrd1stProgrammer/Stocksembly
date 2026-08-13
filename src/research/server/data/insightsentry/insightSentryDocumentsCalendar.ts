import { ZodError, type z } from "zod";
import {
  type InsightSentryClient,
  InsightSentryClientError,
} from "./insightSentryClient";
import type {
  CalendarDataset,
  DocumentsDataset,
  EarningsSnapshot,
  FamilyResult,
  InsightSentryResearchRollout,
} from "./insightSentryResearchContracts";
import {
  DocumentContentSchema,
  DocumentIndexSchema,
  EarningsCalendarSchema,
} from "./insightSentryResearchSchemas";
import {
  familyFailure,
  isoDate,
  pitUnsafeTimestamps,
  providerEpochToIso,
  unixSecondsToIso,
  withheldWhenDisabled,
} from "./insightSentryResearchSupport";

const DOCUMENT_INDEX_TTL = 24 * 60 * 60 * 1_000;
const DOCUMENT_TTL = 30 * 24 * 60 * 60 * 1_000;
const CALENDAR_TTL = 6 * 60 * 60 * 1_000;
const MAX_DOCUMENTS = 3;
const MAX_DOCUMENT_CHARACTERS = 12_000;
const MAX_BRIEFING_DOCUMENT_CHARACTERS = 160_000;
const CALENDAR_WINDOW_DAYS = 90;

function earningsSnapshot(
  event: z.infer<typeof EarningsCalendarSchema>["data"][number],
): EarningsSnapshot {
  return Object.freeze({
    latestReportAt: unixSecondsToIso(event.earnings_release_date),
    nextReportAt: unixSecondsToIso(event.earnings_release_next_date),
    ...(event.currency_code === undefined
      ? {}
      : { currency: event.currency_code }),
    ...(event.earnings_per_share_fq === undefined
      ? {}
      : { epsActual: event.earnings_per_share_fq }),
    ...(event.earnings_per_share_forecast_fq === undefined
      ? {}
      : { epsForecast: event.earnings_per_share_forecast_fq }),
    ...(event.eps_surprise_fq === undefined
      ? {}
      : { epsSurprise: event.eps_surprise_fq }),
    ...(event.eps_surprise_percent_fq === undefined
      ? {}
      : { epsSurprisePercent: event.eps_surprise_percent_fq }),
    ...(event.earnings_per_share_forecast_next_fq === undefined
      ? {}
      : { nextEpsForecast: event.earnings_per_share_forecast_next_fq }),
    ...(event.revenue_fq === undefined
      ? {}
      : { revenueActual: event.revenue_fq }),
    ...(event.revenue_forecast_fq === undefined
      ? {}
      : { revenueForecast: event.revenue_forecast_fq }),
    ...(event.revenue_surprise_fq === undefined
      ? {}
      : { revenueSurprise: event.revenue_surprise_fq }),
    ...(event.revenue_surprise_percent_fq === undefined
      ? {}
      : { revenueSurprisePercent: event.revenue_surprise_percent_fq }),
    ...(event.revenue_forecast_next_fq === undefined
      ? {}
      : { nextRevenueForecast: event.revenue_forecast_next_fq }),
  });
}

export async function collectInsightSentryDocuments(input: {
  readonly client: InsightSentryClient;
  readonly rollout: InsightSentryResearchRollout;
  readonly symbol: string;
  readonly asOf: string;
  readonly collectionMode?: "briefing" | "research";
}): Promise<FamilyResult<DocumentsDataset>> {
  const disabled = withheldWhenDisabled<DocumentsDataset>(
    input.rollout,
    "documents",
  );
  if (disabled !== undefined) return disabled;
  try {
    const index = await input.client.get({
      endpoint: "document_index",
      pathSegments: ["documents"],
      parameters: { code: input.symbol },
      asOfBucket: input.asOf.slice(0, 10),
      schema: DocumentIndexSchema,
      cacheTtlMilliseconds: DOCUMENT_INDEX_TTL,
    });
    const selected = [...index.data]
      .filter((document) => document.is_available)
      .sort(
        (left, right) =>
          right.reported_time - left.reported_time ||
          left.id.localeCompare(right.id),
      )
      .filter(
        (document, position, all) =>
          position === 0 || all[position - 1]?.id !== document.id,
      )
      .slice(0, MAX_DOCUMENTS);
    const contents = await Promise.all(
      selected.map(
        async (document) =>
          await input.client.get({
            endpoint: "document",
            pathSegments: ["documents", document.id],
            parameters: { code: input.symbol, text: true },
            asOfBucket: input.asOf.slice(0, 10),
            schema: DocumentContentSchema,
            cacheTtlMilliseconds: DOCUMENT_TTL,
          }),
      ),
    );
    const characterLimit =
      input.collectionMode === "briefing"
        ? MAX_BRIEFING_DOCUMENT_CHARACTERS
        : MAX_DOCUMENT_CHARACTERS;
    const documents = selected.map((document, indexPosition) => {
      const content = contents[indexPosition];
      if (content === undefined) return undefined;
      return Object.freeze({
        id: document.id,
        category: document.category,
        title: content.data.title,
        reportedAt: unixSecondsToIso(document.reported_time),
        publishedAt: unixSecondsToIso(content.data.published_at),
        content: content.data.content.slice(0, characterLimit),
      });
    });
    return Object.freeze({
      status: "available",
      data: Object.freeze({
        symbol: input.symbol,
        ...pitUnsafeTimestamps(input.asOf, index.retrievedAt),
        documents: documents.filter(
          (document): document is NonNullable<typeof document> =>
            document !== undefined,
        ),
      }),
    });
  } catch (error) {
    if (error instanceof InsightSentryClientError || error instanceof ZodError)
      return familyFailure(error);
    throw error;
  }
}

export async function collectInsightSentryCalendar(input: {
  readonly client: InsightSentryClient;
  readonly rollout: InsightSentryResearchRollout;
  readonly symbol: string;
  readonly asOf: string;
}): Promise<FamilyResult<CalendarDataset>> {
  const disabled = withheldWhenDisabled<CalendarDataset>(
    input.rollout,
    "calendar",
  );
  if (disabled !== undefined) return disabled;
  try {
    const response = await input.client.get({
      endpoint: "calendar",
      pathSegments: ["calendar", "earnings"],
      parameters: { w: 13, country: "US", code: input.symbol },
      asOfBucket: input.asOf.slice(0, 10),
      schema: EarningsCalendarSchema,
      cacheTtlMilliseconds: CALENDAR_TTL,
    });
    const center = new Date(input.asOf);
    const start = new Date(center);
    start.setUTCDate(start.getUTCDate() - CALENDAR_WINDOW_DAYS);
    const end = new Date(center);
    end.setUTCDate(end.getUTCDate() + CALENDAR_WINDOW_DAYS);
    const startSeconds = start.getTime() / 1_000;
    const endSeconds = end.getTime() / 1_000;
    const matching = response.data.data.filter(
      (event) => event.code === input.symbol,
    );
    const events = matching
      .flatMap((event) =>
        [event.earnings_release_date, event.earnings_release_next_date].map(
          (reportAt) => ({
            symbol: event.code,
            name: event.name,
            reportAt,
          }),
        ),
      )
      .filter(
        (event) =>
          event.reportAt >= startSeconds && event.reportAt <= endSeconds,
      )
      .sort(
        (left, right) =>
          left.reportAt - right.reportAt ||
          left.symbol.localeCompare(right.symbol),
      )
      .filter(
        (event, position, all) =>
          position === 0 ||
          all[position - 1]?.reportAt !== event.reportAt ||
          all[position - 1]?.symbol !== event.symbol,
      )
      .slice(0, 20)
      .map((event) =>
        Object.freeze({
          symbol: event.symbol,
          name: event.name,
          reportAt: unixSecondsToIso(event.reportAt),
        }),
      );
    const earnings =
      matching[0] === undefined ? undefined : earningsSnapshot(matching[0]);
    return Object.freeze({
      status: "available",
      data: Object.freeze({
        symbol: input.symbol,
        ...pitUnsafeTimestamps(
          providerEpochToIso(response.data.last_update),
          response.retrievedAt,
        ),
        windowStart: isoDate(start),
        windowEnd: isoDate(end),
        events,
        ...(earnings === undefined ? {} : { earnings }),
      }),
    });
  } catch (error) {
    if (error instanceof InsightSentryClientError || error instanceof ZodError)
      return familyFailure(error);
    throw error;
  }
}

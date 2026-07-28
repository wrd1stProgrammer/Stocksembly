import { createHash } from "node:crypto";
import {
  BlsPayloadSchema,
  type BlsRequest,
  type BlsSeriesId,
  parseBlsRequest,
} from "./blsSchema";
import { readBlsCache, reserveBlsRequest, writeBlsCache } from "./blsStore";
import {
  MACRO_MAX_ATTEMPTS,
  MACRO_REQUEST_TIMEOUT_MILLISECONDS,
  type MacroClock,
  type MacroHttpTransport,
  type MacroProvenance,
  retryDelay,
  UNAVAILABLE_RELEASE_TIME,
  type UnavailableReleaseTime,
} from "./macroHttp";

export type { MacroHttpTransport } from "./macroHttp";

export const BLS_SOURCE_URL =
  "https://api.bls.gov/publicAPI/v2/timeseries/data/";

type BlsFootnote = {
  readonly code?: string;
  readonly text?: string;
};

type BlsValue =
  | { readonly kind: "present"; readonly decimal: string }
  | { readonly kind: "missing"; readonly marker: string };

export type BlsObservation = {
  readonly seriesId: BlsSeriesId;
  readonly observationDate: string;
  readonly year: string;
  readonly period: string;
  readonly periodName: string;
  readonly rawValue: string;
  readonly value: BlsValue;
  readonly footnotes: readonly BlsFootnote[];
};

export type BlsAvailable = {
  readonly status: "available";
  readonly request: BlsRequest;
  readonly observations: readonly BlsObservation[];
  readonly releaseTime: UnavailableReleaseTime;
  readonly provenance: MacroProvenance;
};

export type BlsDegraded = {
  readonly status: "degraded";
  readonly reason: string;
};

export type BlsCollection = BlsAvailable | BlsDegraded;

export type BlsAdapter = {
  readonly collect: (request: unknown) => Promise<BlsCollection>;
};

type BlsAdapterOptions = {
  readonly dataRoot: string;
  readonly transport: MacroHttpTransport;
  readonly clock: MacroClock;
};

function observationDate(year: string, period: string): string {
  return `${year}-${period.slice(1)}-01`;
}

function freshness(
  observations: readonly BlsObservation[],
  retrievedAt: string,
): "fresh" | "stale" {
  const latest = observations.reduce(
    (current, observation) =>
      observation.observationDate > current
        ? observation.observationDate
        : current,
    "0000-00-00",
  );
  const age = Date.parse(retrievedAt) - Date.parse(`${latest}T00:00:00.000Z`);
  return age <= 93 * 86_400_000 ? "fresh" : "stale";
}

function parsePayload(
  body: string,
  request: BlsRequest,
  retrievedAt: string,
): BlsCollection {
  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError)
      return { status: "degraded", reason: "payload_invalid" };
    throw error;
  }
  const parsed = BlsPayloadSchema.safeParse(decoded);
  if (!parsed.success) return { status: "degraded", reason: "payload_invalid" };
  const series = parsed.data.Results.series[0];
  if (series === undefined || series.seriesID !== request.seriesId)
    return { status: "degraded", reason: "response_series_mismatch" };
  if (
    series.data.some(
      (datum) =>
        Number(datum.year) < request.startYear ||
        Number(datum.year) > request.endYear,
    )
  ) {
    return { status: "degraded", reason: "response_range_mismatch" };
  }
  const observations = series.data.map((datum): BlsObservation => {
    const footnotes = datum.footnotes.map(
      (footnote): BlsFootnote => ({
        ...(footnote.code === undefined ? {} : { code: footnote.code }),
        ...(footnote.text === undefined ? {} : { text: footnote.text }),
      }),
    );
    const value: BlsValue =
      datum.value === "-"
        ? { kind: "missing", marker: datum.value }
        : { kind: "present", decimal: datum.value };
    return Object.freeze({
      seriesId: series.seriesID,
      observationDate: observationDate(datum.year, datum.period),
      year: datum.year,
      period: datum.period,
      periodName: datum.periodName,
      rawValue: datum.value,
      value,
      footnotes: Object.freeze(footnotes),
    });
  });
  if (observations.length === 0)
    return { status: "degraded", reason: "data_unavailable" };
  return Object.freeze({
    status: "available",
    request: Object.freeze(request),
    observations: Object.freeze(observations),
    releaseTime: UNAVAILABLE_RELEASE_TIME,
    provenance: Object.freeze({
      sourceUrl: BLS_SOURCE_URL,
      retrievedAt,
      contentHash: createHash("sha256").update(body).digest("hex"),
      freshness: freshness(observations, retrievedAt),
    }),
  });
}

function bodyFor(request: BlsRequest): string {
  return JSON.stringify({
    seriesid: [request.seriesId],
    startyear: String(request.startYear),
    endyear: String(request.endYear),
  });
}

async function retrieve(
  options: BlsAdapterOptions,
  request: BlsRequest,
): Promise<BlsCollection> {
  const cached = await readBlsCache(options.dataRoot, request);
  if (cached !== undefined)
    return parsePayload(cached.body, request, cached.retrievedAt);
  options.clock.isoNow();
  for (let attempt = 1; attempt <= MACRO_MAX_ATTEMPTS; attempt += 1) {
    const utcDay = options.clock.isoNow().slice(0, 10);
    if (!(await reserveBlsRequest(options.dataRoot, utcDay)))
      return { status: "degraded", reason: "daily_budget_exhausted" };
    try {
      const response = await options.transport({
        url: BLS_SOURCE_URL,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: bodyFor(request),
        timeoutMilliseconds: MACRO_REQUEST_TIMEOUT_MILLISECONDS,
      });
      if (response.status >= 500) {
        if (attempt < MACRO_MAX_ATTEMPTS) {
          await options.clock.sleep(retryDelay(attempt));
          continue;
        }
        return { status: "degraded", reason: "transport_unavailable" };
      }
      if (response.status !== 200)
        return { status: "degraded", reason: "transport_unavailable" };
      const retrievedAt = options.clock.isoNow();
      const parsed = parsePayload(response.body, request, retrievedAt);
      if (parsed.status === "available") {
        await writeBlsCache({
          dataRoot: options.dataRoot,
          request,
          body: response.body,
          retrievedAt,
        });
      }
      return parsed;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (attempt === MACRO_MAX_ATTEMPTS)
        return { status: "degraded", reason: "transport_unavailable" };
      await options.clock.sleep(retryDelay(attempt));
    }
  }
  return { status: "degraded", reason: "transport_unavailable" };
}

export function createBlsAdapter(options: BlsAdapterOptions): BlsAdapter {
  return Object.freeze({
    collect: async (input: unknown): Promise<BlsCollection> => {
      const parsed = parseBlsRequest(input);
      return parsed.ok
        ? retrieve(options, parsed.request)
        : { status: "degraded", reason: parsed.reason };
    },
  });
}

export function sealBlsCollection(
  collection: BlsCollection,
  evidenceCutoffAt: string,
):
  | {
      readonly status: "sealed";
      readonly evidenceCutoffAt: string;
      readonly collection: BlsAvailable;
    }
  | BlsDegraded {
  if (collection.status === "degraded") return collection;
  if (
    Date.parse(collection.provenance.retrievedAt) > Date.parse(evidenceCutoffAt)
  )
    return { status: "degraded", reason: "retrieved_after_cutoff" };
  return Object.freeze({ status: "sealed", evidenceCutoffAt, collection });
}

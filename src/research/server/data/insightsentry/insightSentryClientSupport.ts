import {
  InsightSentryClientError,
  type InsightSentryDiagnostics,
  type InsightSentryFailureCode,
} from "./insightSentryFailureClassifier";
import type { InsightSentryQuotaObservation } from "./insightSentryQuota";
import type { InsightSentryWireResponse } from "./insightSentryTransport";
import {
  INSIGHTSENTRY_CONTRACT_VERSION,
  type InsightSentryCacheIdentity,
  type InsightSentryClock,
  type InsightSentryParameterValue,
  type InsightSentryRequest,
} from "./insightSentryTypes";

function encode(value: string): string {
  return encodeURIComponent(value);
}

function parameterValue(value: InsightSentryParameterValue): string {
  return Array.isArray(value) ? value.join(",") : String(value);
}

function encodedEntries(
  values: Readonly<Record<string, InsightSentryParameterValue>>,
): string {
  return Object.keys(values)
    .sort()
    .map(
      (name) => `${encode(name)}=${encode(parameterValue(values[name] ?? ""))}`,
    )
    .join("&");
}

function encodedFlags(
  flags: Readonly<Record<string, boolean>> | undefined,
): string {
  if (flags === undefined) return "";
  return Object.keys(flags)
    .sort()
    .map((name) => `${encode(name)}=${String(flags[name] ?? false)}`)
    .join("&");
}

function encodedBody(
  body: Readonly<Record<string, InsightSentryParameterValue>> | undefined,
): string {
  if (body === undefined) return "";
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(body)
        .sort()
        .map((key) => [key, body[key]]),
    ),
  );
}

export function canonicalInsightSentryCacheKey(
  identity: InsightSentryCacheIdentity,
): string {
  const legacyGetKey = [
    INSIGHTSENTRY_CONTRACT_VERSION,
    identity.endpoint,
    identity.pathSegments.map(encode).join("/"),
    encodedEntries(identity.parameters),
    encodedFlags(identity.adjustmentFlags),
    identity.asOfBucket,
  ];
  if (
    (identity.method === undefined || identity.method === "GET") &&
    identity.requestBody === undefined
  )
    return legacyGetKey.join("|");
  return [
    INSIGHTSENTRY_CONTRACT_VERSION,
    identity.method ?? "GET",
    identity.endpoint,
    identity.pathSegments.map(encode).join("/"),
    encodedEntries(identity.parameters),
    encodedBody(identity.requestBody),
    encodedFlags(identity.adjustmentFlags),
    identity.asOfBucket,
  ].join("|");
}

export function insightSentryRequestUrl(
  host: string,
  request: InsightSentryCacheIdentity,
): URL {
  const path = request.pathSegments.map(encode).join("/");
  const url = new URL(
    `https://${host}/${INSIGHTSENTRY_CONTRACT_VERSION}/${path}`,
  );
  for (const name of Object.keys(request.parameters).sort()) {
    url.searchParams.set(name, parameterValue(request.parameters[name] ?? ""));
  }
  for (const name of Object.keys(request.adjustmentFlags ?? {}).sort()) {
    url.searchParams.set(
      name,
      String(request.adjustmentFlags?.[name] ?? false),
    );
  }
  return url;
}

export function normalizedInsightSentryHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    ),
  );
}

export function insightSentryDiagnostics(
  host: string,
  request: InsightSentryCacheIdentity,
  cacheKey: string,
  status?: number,
): InsightSentryDiagnostics {
  return Object.freeze({
    host,
    endpoint: request.endpoint,
    cacheKey,
    ...(status === undefined ? {} : { status }),
  });
}

export async function readBoundedInsightSentryBody(input: {
  readonly response: InsightSentryWireResponse;
  readonly limitBytes: number;
  readonly diagnostics: InsightSentryDiagnostics;
}): Promise<Uint8Array> {
  const headers = normalizedInsightSentryHeaders(input.response.headers);
  const declared = Number(headers["content-length"]);
  if (Number.isFinite(declared) && declared > input.limitBytes) {
    input.response.abort();
    throw new InsightSentryClientError(
      "oversized",
      "never",
      { ...input.diagnostics, limitBytes: input.limitBytes },
      input.response.status,
    );
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of input.response.body) {
    total += chunk.byteLength;
    if (total > input.limitBytes) {
      input.response.abort();
      throw new InsightSentryClientError(
        "oversized",
        "never",
        { ...input.diagnostics, limitBytes: input.limitBytes },
        input.response.status,
      );
    }
    chunks.push(Uint8Array.from(chunk));
  }
  return Uint8Array.from(
    Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
  );
}

export function parseInsightSentryPayload<T>(input: {
  readonly request: InsightSentryRequest<T>;
  readonly bytes: Uint8Array;
  readonly diagnostics: InsightSentryDiagnostics;
  readonly now: number;
}): T {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(input.bytes).toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new InsightSentryClientError(
        "non_json",
        "never",
        input.diagnostics,
      );
    throw error;
  }
  const parsed = input.request.schema.safeParse(decoded);
  if (!parsed.success)
    throw new InsightSentryClientError(
      "schema_drift",
      "never",
      input.diagnostics,
    );
  if (input.request.freshness !== undefined) {
    const timestamp = Date.parse(
      input.request.freshness.timestamp(parsed.data),
    );
    if (
      !Number.isFinite(timestamp) ||
      input.now - timestamp > input.request.freshness.maxAgeMilliseconds
    )
      throw new InsightSentryClientError("stale", "never", input.diagnostics);
  }
  return parsed.data;
}

export function quotaObservationFromHeaders(
  headers: Readonly<Record<string, string>>,
  observedAt: string,
): InsightSentryQuotaObservation | undefined {
  const normalized = normalizedInsightSentryHeaders(headers);
  const limit = Number(normalized["x-ratelimit-requests-limit"]);
  const remaining = Number(normalized["x-ratelimit-requests-remaining"]);
  if (
    !Number.isInteger(limit) ||
    limit <= 0 ||
    !Number.isInteger(remaining) ||
    remaining < 0
  )
    return undefined;
  const reset = normalized["x-ratelimit-requests-reset"];
  const resetSeconds = Number(reset);
  const parsedReset =
    reset !== undefined && Number.isFinite(resetSeconds) && resetSeconds >= 0
      ? Date.parse(observedAt) + resetSeconds * 1_000
      : reset === undefined
        ? Number.NaN
        : Date.parse(reset);
  return Object.freeze({
    observedAt,
    limit,
    remaining,
    ...(Number.isFinite(parsedReset)
      ? { resetAt: new Date(parsedReset).toISOString() }
      : {}),
  });
}

export function insightSentryRetryAt(input: {
  readonly retryAfter?: string;
  readonly ordinal: number;
  readonly clock: InsightSentryClock;
  readonly random: () => number;
}): string {
  if (input.retryAfter !== undefined) {
    const seconds = Number(input.retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0)
      return new Date(
        input.clock.now() + Math.ceil(seconds * 1_000),
      ).toISOString();
    const date = Date.parse(input.retryAfter);
    if (Number.isFinite(date) && date >= input.clock.now())
      return new Date(date).toISOString();
  }
  const base = Math.min(300_000, 1_000 * 2 ** (input.ordinal - 1));
  const random = Math.max(0, Math.min(1, input.random()));
  return new Date(
    input.clock.now() + base + Math.floor(base * 0.25 * random),
  ).toISOString();
}

export function transientInsightSentryCode(
  code: InsightSentryFailureCode,
): "rate_limited" | "server_error" | "network" | "timeout" {
  switch (code) {
    case "rate_limited":
    case "server_error":
    case "network":
    case "timeout":
      return code;
    default:
      throw new InsightSentryClientError(code, "never", {
        host: "",
        endpoint: "",
        cacheKey: "",
      });
  }
}

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { executeSecAttempt, type SecAttemptOutcome } from "./secClientAttempt";
import {
  readSecCache,
  SecCacheCorruptionError,
  type SecCacheEntry,
  writeSecCache,
} from "./secClientCache";
import { SecClientError, SecTransportTimeoutError } from "./secClientErrors";
import { deriveSecUserAgent } from "./secClientIdentity.internal";
import {
  buildSecUrl,
  type SecRequest,
  SecRequestSchema,
} from "./secClientRequest";
import { organizationScheduler } from "./secClientScheduler";
import type {
  SecClient,
  SecClientOptions,
  SecClock,
  SecFetchResult,
  SecResponseProvenance,
  SecWireResponse,
} from "./secClientTypes";
import { nodeSecWireAdapter } from "./secClientWire";
import { loadSecIdentityForTransport } from "./secIdentityConfig.internal";

export { SecClientError, SecTransportTimeoutError } from "./secClientErrors";
export type {
  SecClient,
  SecClock,
  SecFetchResult,
  SecResponseProvenance,
  SecWireAdapter,
  SecWireRequest,
  SecWireResponse,
} from "./secClientTypes";

export const SEC_MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const MAX_CONCURRENCY = 3;

const SYSTEM_CLOCK: SecClock = Object.freeze({
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
  sleep: (milliseconds) =>
    new Promise<void>((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function retryDelay(
  retryAfter: string | undefined,
  attempt: number,
  clock: SecClock,
): number {
  if (retryAfter !== undefined) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(60_000, Math.ceil(seconds * 1_000));
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt))
      return Math.min(60_000, Math.max(0, retryAt - clock.now()));
  }
  return Math.min(2_000, 250 * 2 ** (attempt - 1));
}

function requestHeaders(
  userAgent: string,
  cache: SecCacheEntry | undefined,
): Readonly<Record<string, string>> {
  return Object.freeze({
    accept: "application/json, text/html;q=0.9, text/plain;q=0.8",
    "accept-encoding": "identity",
    "user-agent": userAgent,
    ...(cache?.etag === undefined ? {} : { "if-none-match": cache.etag }),
    ...(cache?.lastModified === undefined
      ? {}
      : { "if-modified-since": cache.lastModified }),
  });
}

function immutableHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze({ ...headers });
}

function responseHeader(
  headers: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  return headers[name];
}

function cacheFreshnessMilliseconds(request: SecRequest): number {
  switch (request.kind) {
    case "filing_document":
      return Number.POSITIVE_INFINITY;
    case "company_tickers_exchange":
      return 24 * 60 * 60 * 1_000;
    case "company_facts":
      return 6 * 60 * 60 * 1_000;
    case "submissions":
      return 60 * 60 * 1_000;
    case "submissions_file":
      return 24 * 60 * 60 * 1_000;
  }
}

function isFreshCache(
  request: SecRequest,
  cache: SecCacheEntry,
  now: number,
): boolean {
  const storedAt = Date.parse(cache.storedAt);
  return (
    Number.isFinite(storedAt) &&
    now - storedAt < cacheFreshnessMilliseconds(request)
  );
}

function freezeResult(options: {
  readonly request: SecRequest;
  readonly bytes: Uint8Array;
  readonly sourceUrl: string;
  readonly requestedAt: string;
  readonly retrievedAt: string;
  readonly response: SecWireResponse;
  readonly identityHash: string;
  readonly cacheStatus: "miss" | "revalidated";
  readonly contentHash: string;
}): SecFetchResult {
  const provenance: SecResponseProvenance = Object.freeze({
    sourceUrl: options.sourceUrl,
    requestedAt: options.requestedAt,
    retrievedAt: options.retrievedAt,
    responseStatus: options.response.status,
    responseHeaders: immutableHeaders(options.response.headers),
    contentHash: options.contentHash,
    byteLength: options.bytes.byteLength,
    identityHash: options.identityHash,
    cacheStatus: options.cacheStatus,
  });
  return Object.freeze({
    request: Object.freeze(options.request),
    bytes: Uint8Array.from(options.bytes),
    provenance,
  });
}

function freezeCacheHit(options: {
  readonly request: SecRequest;
  readonly cache: SecCacheEntry;
  readonly sourceUrl: string;
  readonly requestedAt: string;
  readonly identityHash: string;
}): SecFetchResult {
  const provenance: SecResponseProvenance = Object.freeze({
    sourceUrl: options.sourceUrl,
    requestedAt: options.requestedAt,
    retrievedAt: options.cache.storedAt,
    responseStatus: 200,
    responseHeaders: Object.freeze({
      "content-type": options.cache.contentType,
    }),
    contentHash: options.cache.contentHash,
    byteLength: options.cache.bytes.byteLength,
    identityHash: options.identityHash,
    cacheStatus: "hit",
  });
  return Object.freeze({
    request: Object.freeze(options.request),
    bytes: Uint8Array.from(options.cache.bytes),
    provenance,
  });
}

async function readCache(dataRoot: string, sourceUrl: string) {
  try {
    return await readSecCache(dataRoot, sourceUrl);
  } catch (error) {
    if (error instanceof SecCacheCorruptionError)
      throw new SecClientError("SEC_CACHE_CORRUPT");
    throw error;
  }
}

export function createSecClient(options: SecClientOptions): SecClient {
  const adapter = options.adapter ?? nodeSecWireAdapter;
  const clock = options.clock ?? SYSTEM_CLOCK;
  const maxConcurrency = Math.min(
    MAX_CONCURRENCY,
    Math.max(1, Math.floor(options.maxConcurrency ?? MAX_CONCURRENCY)),
  );
  return Object.freeze({
    fetch: async (untrustedRequest: unknown) => {
      const parsed = SecRequestSchema.safeParse(untrustedRequest);
      if (!parsed.success) throw new SecClientError("SEC_REQUEST_INVALID");
      const identity = await loadSecIdentityForTransport(options.dataRoot);
      const url = buildSecUrl(parsed.data);
      const sourceUrl = url.href;
      const cache = await readCache(options.dataRoot, sourceUrl);
      const requestedAt = clock.isoNow();
      if (
        cache !== undefined &&
        isFreshCache(parsed.data, cache, clock.now())
      ) {
        return freezeCacheHit({
          request: parsed.data,
          cache,
          sourceUrl,
          requestedAt,
          identityHash: identity.identityHash,
        });
      }
      const scheduler = organizationScheduler(
        `${resolve(options.dataRoot)}\0${identity.identityHash}`,
        { clock, maxConcurrency },
      );
      const headers = requestHeaders(deriveSecUserAgent(identity), cache);

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        let outcome: SecAttemptOutcome;
        try {
          outcome = await scheduler.run(() =>
            executeSecAttempt({
              adapter,
              request: parsed.data,
              url,
              headers,
              cache,
              timeoutMilliseconds: REQUEST_TIMEOUT_MILLISECONDS,
              limitBytes: SEC_MAX_RESPONSE_BYTES,
            }),
          );
        } catch (error) {
          if (!(error instanceof SecTransportTimeoutError)) throw error;
          if (attempt === MAX_ATTEMPTS)
            throw new SecClientError("SEC_TRANSPORT_TIMEOUT", {
              attempts: attempt,
            });
          await clock.sleep(retryDelay(undefined, attempt, clock));
          continue;
        }

        switch (outcome.kind) {
          case "retry":
            if (attempt === MAX_ATTEMPTS)
              throw new SecClientError("SEC_RETRY_EXHAUSTED", {
                status: outcome.status,
                attempts: attempt,
              });
            await clock.sleep(retryDelay(outcome.retryAfter, attempt, clock));
            continue;
          case "revalidated": {
            const retrievedAt = clock.isoNow();
            const etag =
              responseHeader(outcome.response.headers, "etag") ??
              outcome.cache.etag;
            const lastModified =
              responseHeader(outcome.response.headers, "last-modified") ??
              outcome.cache.lastModified;
            await writeSecCache({
              dataRoot: options.dataRoot,
              sourceUrl,
              bytes: outcome.cache.bytes,
              contentType: outcome.cache.contentType,
              contentHash: outcome.cache.contentHash,
              storedAt: retrievedAt,
              ...(etag === undefined ? {} : { etag }),
              ...(lastModified === undefined ? {} : { lastModified }),
            });
            return freezeResult({
              request: parsed.data,
              bytes: outcome.cache.bytes,
              sourceUrl,
              requestedAt,
              retrievedAt,
              response: outcome.response,
              identityHash: identity.identityHash,
              cacheStatus: "revalidated",
              contentHash: outcome.cache.contentHash,
            });
          }
          case "completed": {
            const contentHash = sha256(outcome.bytes);
            const retrievedAt = clock.isoNow();
            const etag = responseHeader(outcome.response.headers, "etag");
            const lastModified = responseHeader(
              outcome.response.headers,
              "last-modified",
            );
            await writeSecCache({
              dataRoot: options.dataRoot,
              sourceUrl,
              bytes: outcome.bytes,
              contentType: outcome.contentType,
              contentHash,
              storedAt: retrievedAt,
              ...(etag === undefined ? {} : { etag }),
              ...(lastModified === undefined ? {} : { lastModified }),
            });
            return freezeResult({
              request: parsed.data,
              bytes: outcome.bytes,
              sourceUrl,
              requestedAt,
              retrievedAt,
              response: outcome.response,
              identityHash: identity.identityHash,
              cacheStatus: "miss",
              contentHash,
            });
          }
        }
      }
      throw new SecClientError("SEC_RETRY_EXHAUSTED", {
        attempts: MAX_ATTEMPTS,
      });
    },
  });
}

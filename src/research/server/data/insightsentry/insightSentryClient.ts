import {
  readInsightSentryCache,
  writeInsightSentryCache,
} from "./insightSentryCache";
import {
  canonicalInsightSentryCacheKey,
  insightSentryDiagnostics,
  parseInsightSentryPayload,
} from "./insightSentryClientSupport";
import { createInsightSentryExecutor } from "./insightSentryExecution";
import { InsightSentryClientError } from "./insightSentryFailureClassifier";
import { clearInsightSentryRetryIntent } from "./insightSentryQuota";
import { nodeInsightSentryWireAdapter } from "./insightSentryTransport";
import type {
  InsightSentryClient,
  InsightSentryClientOptions,
  InsightSentryClock,
  InsightSentryRequest,
  InsightSentryResult,
} from "./insightSentryTypes";

export { canonicalInsightSentryCacheKey } from "./insightSentryClientSupport";
export { InsightSentryClientError } from "./insightSentryFailureClassifier";
export type {
  InsightSentryClient,
  InsightSentryClientOptions,
  InsightSentryRequest,
  InsightSentryResult,
} from "./insightSentryTypes";

export const INSIGHTSENTRY_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const INSIGHTSENTRY_MAX_ATTEMPTS = 3;
const INSIGHTSENTRY_MAX_LOCAL_RETRY_DELAY_MS = 5_000;

const SYSTEM_CLOCK: InsightSentryClock = Object.freeze({
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
});

function assertNeverConfiguration(value: never): never {
  void value;
  throw new InsightSentryClientError("missing_configuration", "never", {
    host: "",
    endpoint: "",
    cacheKey: "",
  });
}

export function createInsightSentryClient(
  options: InsightSentryClientOptions,
): InsightSentryClient {
  const clock = options.clock ?? SYSTEM_CLOCK;
  const limitBytes = Math.min(
    INSIGHTSENTRY_MAX_RESPONSE_BYTES,
    Math.max(
      1,
      Math.floor(options.maxResponseBytes ?? INSIGHTSENTRY_MAX_RESPONSE_BYTES),
    ),
  );
  const execute = createInsightSentryExecutor({
    adapter: options.adapter ?? nodeInsightSentryWireAdapter,
    clock,
    random: options.random ?? Math.random,
    dataRoot: options.dataRoot,
    limitBytes,
    ...(options.onUpstreamRequest === undefined
      ? {}
      : { onUpstreamRequest: options.onUpstreamRequest }),
  });
  const inFlight = new Map<string, ReturnType<typeof execute>>();
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  async function executeWithRetry<T>(input: {
    readonly request: InsightSentryRequest<T>;
    readonly cacheKey: string;
    readonly host: string;
    readonly headers: Readonly<Record<string, string>>;
  }): ReturnType<typeof execute> {
    let lastError: InsightSentryClientError | undefined;
    for (let attempt = 1; attempt <= INSIGHTSENTRY_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await execute({
          ...input,
          request: { ...input.request, retryOrdinal: attempt },
        });
      } catch (error) {
        if (!(error instanceof InsightSentryClientError)) throw error;
        lastError = error;
        if (
          error.retry !== "durable" ||
          attempt === INSIGHTSENTRY_MAX_ATTEMPTS ||
          error.retryAt === undefined
        )
          throw error;
        const delay = Math.max(0, Date.parse(error.retryAt) - clock.now());
        if (delay > INSIGHTSENTRY_MAX_LOCAL_RETRY_DELAY_MS) throw error;
        await sleep(delay);
      }
    }
    if (lastError !== undefined) throw lastError;
    throw new TypeError("insightsentry_retry_exhausted");
  }

  return Object.freeze({
    get: async <T>(
      request: InsightSentryRequest<T>,
    ): Promise<InsightSentryResult<T>> => {
      const cacheKey = canonicalInsightSentryCacheKey(request);
      switch (options.configuration.status) {
        case "not_configured":
          throw new InsightSentryClientError(
            "missing_configuration",
            "never",
            insightSentryDiagnostics("", request, cacheKey),
            undefined,
            undefined,
            options.configuration.reason,
          );
        case "available": {
          const host = options.configuration.config.rapidApiHost;
          const details = insightSentryDiagnostics(host, request, cacheKey);
          const cached = await readInsightSentryCache(
            options.dataRoot,
            cacheKey,
            clock.now(),
          );
          if (cached !== undefined) {
            const data = parseInsightSentryPayload({
              request,
              bytes: cached.bytes,
              diagnostics: details,
              now: clock.now(),
            });
            options.onResponse?.({
              cacheKey,
              endpoint: request.endpoint,
              cacheStatus: "hit",
              retrievedAt: cached.retrievedAt,
              bytes: Uint8Array.from(cached.bytes),
            });
            return Object.freeze({
              data,
              cacheKey,
              cacheStatus: "hit",
              retrievedAt: cached.retrievedAt,
              responseBytes: cached.responseBytes,
            });
          }

          let pending = inFlight.get(cacheKey);
          if (pending === undefined) {
            pending = executeWithRetry({
              request,
              cacheKey,
              host,
              headers: options.configuration.config.requestHeaders(),
            });
            inFlight.set(cacheKey, pending);
          }
          try {
            const raw = await pending;
            const data = parseInsightSentryPayload({
              request,
              bytes: raw.bytes,
              diagnostics: details,
              now: clock.now(),
            });
            await writeInsightSentryCache({
              dataRoot: options.dataRoot,
              cacheKey,
              bytes: raw.bytes,
              retrievedAt: raw.retrievedAt,
              expiresAt: new Date(
                clock.now() + request.cacheTtlMilliseconds,
              ).toISOString(),
            });
            await clearInsightSentryRetryIntent(options.dataRoot, cacheKey);
            options.onResponse?.({
              cacheKey,
              endpoint: request.endpoint,
              cacheStatus: "miss",
              retrievedAt: raw.retrievedAt,
              bytes: Uint8Array.from(raw.bytes),
            });
            return Object.freeze({
              data,
              cacheKey,
              cacheStatus: "miss",
              retrievedAt: raw.retrievedAt,
              responseBytes: raw.responseBytes,
            });
          } finally {
            if (inFlight.get(cacheKey) === pending) inFlight.delete(cacheKey);
          }
        }
        default:
          return assertNeverConfiguration(options.configuration);
      }
    },
  });
}

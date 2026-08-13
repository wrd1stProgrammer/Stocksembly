import { resolve } from "node:path";
import {
  insightSentryDiagnostics,
  insightSentryRequestUrl,
  insightSentryRetryAt,
  normalizedInsightSentryHeaders,
  quotaObservationFromHeaders,
  readBoundedInsightSentryBody,
  transientInsightSentryCode,
} from "./insightSentryClientSupport";
import {
  classifyHttpStatus,
  classifyTransportFailure,
  InsightSentryClientError,
} from "./insightSentryFailureClassifier";
import {
  InsightSentryQuotaGovernor,
  writeInsightSentryRetryIntent,
} from "./insightSentryQuota";
import {
  InsightSentryTransportError,
  type InsightSentryWireAdapter,
} from "./insightSentryTransport";
import type {
  InsightSentryCacheIdentity,
  InsightSentryClock,
} from "./insightSentryTypes";

const sharedQuotaGovernors = new Map<string, InsightSentryQuotaGovernor>();

function quotaGovernor(dataRoot: string): InsightSentryQuotaGovernor {
  const key = resolve(dataRoot);
  const existing = sharedQuotaGovernors.get(key);
  if (existing !== undefined) return existing;
  const created = new InsightSentryQuotaGovernor(key);
  sharedQuotaGovernors.set(key, created);
  return created;
}

export type InsightSentryRawResult = {
  readonly bytes: Uint8Array;
  readonly retrievedAt: string;
  readonly responseBytes: number;
};

type ExecutionRequest = InsightSentryCacheIdentity & {
  readonly retryOrdinal?: number;
};

export function createInsightSentryExecutor(options: {
  readonly adapter: InsightSentryWireAdapter;
  readonly clock: InsightSentryClock;
  readonly random: () => number;
  readonly dataRoot: string;
  readonly limitBytes: number;
  readonly onUpstreamRequest?: (input: {
    readonly cacheKey: string;
    readonly endpoint: string;
    readonly url: string;
  }) => void;
}): (input: {
  readonly request: ExecutionRequest;
  readonly cacheKey: string;
  readonly host: string;
  readonly headers: Readonly<Record<string, string>>;
}) => Promise<InsightSentryRawResult> {
  const governor = quotaGovernor(options.dataRoot);

  async function durableFailure(input: {
    readonly code: "rate_limited" | "server_error" | "network" | "timeout";
    readonly request: ExecutionRequest;
    readonly cacheKey: string;
    readonly host: string;
    readonly retryAfter?: string;
    readonly status?: number;
  }): Promise<never> {
    const ordinal = Math.max(1, Math.floor(input.request.retryOrdinal ?? 1));
    const retryAt = insightSentryRetryAt({
      ordinal,
      clock: options.clock,
      random: options.random,
      ...(input.retryAfter === undefined
        ? {}
        : { retryAfter: input.retryAfter }),
    });
    await writeInsightSentryRetryIntent(options.dataRoot, {
      cacheKey: input.cacheKey,
      classification: input.code,
      retryAt,
      ordinal,
      endpoint: input.request.endpoint,
      ...(input.status === undefined ? {} : { status: input.status }),
    });
    throw new InsightSentryClientError(
      input.code,
      "durable",
      insightSentryDiagnostics(
        input.host,
        input.request,
        input.cacheKey,
        input.status,
      ),
      input.status,
      retryAt,
    );
  }

  return async (input): Promise<InsightSentryRawResult> => {
    try {
      return await governor.run(async () => {
        const url = insightSentryRequestUrl(input.host, input.request);
        options.onUpstreamRequest?.({
          cacheKey: input.cacheKey,
          endpoint: input.request.endpoint,
          url: url.toString(),
        });
        const response = await options.adapter({
          url,
          headers: input.headers,
          method: input.request.method ?? "GET",
          ...(input.request.requestBody === undefined
            ? {}
            : {
                body: Buffer.from(
                  JSON.stringify(input.request.requestBody),
                  "utf8",
                ),
              }),
          timeoutMilliseconds: 30_000,
        });
        const observedAt = options.clock.isoNow();
        const observation = quotaObservationFromHeaders(
          response.headers,
          observedAt,
        );
        if (observation !== undefined) await governor.observe(observation);
        if (response.status < 200 || response.status >= 300) {
          response.abort();
          const failure = classifyHttpStatus(response.status);
          if (failure.retry === "durable") {
            const retryAfter = normalizedInsightSentryHeaders(response.headers)[
              "retry-after"
            ];
            return await durableFailure({
              code: transientInsightSentryCode(failure.code),
              request: input.request,
              cacheKey: input.cacheKey,
              host: input.host,
              status: response.status,
              ...(retryAfter === undefined ? {} : { retryAfter }),
            });
          }
          throw new InsightSentryClientError(
            failure.code,
            "never",
            insightSentryDiagnostics(
              input.host,
              input.request,
              input.cacheKey,
              response.status,
            ),
            response.status,
          );
        }
        const details = insightSentryDiagnostics(
          input.host,
          input.request,
          input.cacheKey,
          response.status,
        );
        const bytes = await readBoundedInsightSentryBody({
          response,
          limitBytes: options.limitBytes,
          diagnostics: details,
        });
        const contentType = (
          normalizedInsightSentryHeaders(response.headers)["content-type"] ?? ""
        )
          .split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        if (
          contentType !== "application/json" &&
          !contentType?.endsWith("+json")
        )
          throw new InsightSentryClientError(
            "non_json",
            "never",
            details,
            response.status,
          );
        return Object.freeze({
          bytes,
          retrievedAt: observedAt,
          responseBytes: bytes.byteLength,
        });
      });
    } catch (error) {
      if (error instanceof InsightSentryClientError) throw error;
      if (error instanceof InsightSentryTransportError)
        return await durableFailure({
          code: classifyTransportFailure(error.kind),
          request: input.request,
          cacheKey: input.cacheKey,
          host: input.host,
        });
      if (error instanceof Error)
        return await durableFailure({
          code: "network",
          request: input.request,
          cacheKey: input.cacheKey,
          host: input.host,
        });
      throw error;
    }
  };
}

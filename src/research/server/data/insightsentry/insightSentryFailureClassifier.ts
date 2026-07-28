import type { InsightSentryConfigUnavailableReason } from "./insightSentryConfig";
import type { InsightSentryTransportFailure } from "./insightSentryTransport";

export const INSIGHTSENTRY_FAILURE_CODES = [
  "missing_configuration",
  "unauthorized",
  "subscription_required",
  "rate_limited",
  "server_error",
  "network",
  "timeout",
  "non_json",
  "schema_drift",
  "oversized",
  "stale",
  "unexpected_status",
] as const;
export type InsightSentryFailureCode =
  (typeof INSIGHTSENTRY_FAILURE_CODES)[number];

export type InsightSentryDiagnostics = {
  readonly host: string;
  readonly endpoint: string;
  readonly cacheKey: string;
  readonly status?: number;
  readonly limitBytes?: number;
};

export class InsightSentryClientError extends Error {
  readonly name = "InsightSentryClientError";

  constructor(
    readonly code: InsightSentryFailureCode,
    readonly retry: "never" | "durable",
    readonly diagnostics: InsightSentryDiagnostics,
    readonly status?: number,
    readonly retryAt?: string,
    readonly configurationReason?: InsightSentryConfigUnavailableReason,
  ) {
    super(code);
  }
}

export function classifyHttpStatus(status: number): Readonly<{
  code: InsightSentryFailureCode;
  retry: "never" | "durable";
}> {
  if (status === 401) return { code: "unauthorized", retry: "never" };
  if (status === 403) return { code: "subscription_required", retry: "never" };
  if (status === 429) return { code: "rate_limited", retry: "durable" };
  if (status >= 500) return { code: "server_error", retry: "durable" };
  return { code: "unexpected_status", retry: "never" };
}

export function classifyTransportFailure(
  failure: InsightSentryTransportFailure,
): "network" | "timeout" {
  switch (failure) {
    case "network":
      return "network";
    case "timeout":
      return "timeout";
  }
}

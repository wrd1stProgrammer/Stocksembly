import { z } from "zod";
import type {
  InsightSentryConfigResult,
  InsightSentryRequestHeaders,
} from "./insightSentryConfig";

const ENTITLEMENT_PATH = "/v3/symbols/search";
const ProbeResponseSchema = z
  .object({
    status: z.number().int().min(100).max(599),
    body: z.string(),
    headers: z.record(z.string(), z.string()),
  })
  .strict();

export type InsightSentryProbeTransport = (request: {
  readonly url: string;
  readonly headers: InsightSentryRequestHeaders;
}) => Promise<{
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}>;

export type InsightSentryEntitlementMetadata = {
  readonly host: string;
  readonly path: typeof ENTITLEMENT_PATH;
  readonly providerStatus: number;
  readonly responseBytes: number;
  readonly quotaHeaders: Readonly<{
    readonly requestsLimit?: string;
    readonly requestsRemaining?: string;
    readonly requestsReset?: string;
  }>;
};

export type InsightSentryEntitlement =
  | {
      readonly status: "not_configured";
      readonly reason:
        | "missing_key"
        | "invalid_key"
        | "missing_host"
        | "invalid_host";
    }
  | {
      readonly status: "not_configured";
      readonly reason: "unauthorized";
      readonly metadata: InsightSentryEntitlementMetadata;
    }
  | {
      readonly status: "subscription_required";
      readonly metadata: InsightSentryEntitlementMetadata;
    }
  | {
      readonly status: "available";
      readonly metadata: InsightSentryEntitlementMetadata;
    };

export class InsightSentryEntitlementProbeError extends Error {
  readonly name = "InsightSentryEntitlementProbeError";

  constructor(
    readonly code: "unexpected_status",
    readonly providerStatus: number,
  ) {
    super(code);
  }
}

class InsightSentryConfigStateError extends Error {
  readonly name = "InsightSentryConfigStateError";
}

function assertNeverConfiguration(configuration: never): never {
  throw new InsightSentryConfigStateError(
    `Unexpected InsightSentry configuration: ${typeof configuration}`,
  );
}

function quotaHeaders(
  headers: Readonly<Record<string, string>>,
): InsightSentryEntitlementMetadata["quotaHeaders"] {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const requestsLimit = normalized["x-ratelimit-requests-limit"];
  const requestsRemaining = normalized["x-ratelimit-requests-remaining"];
  const requestsReset = normalized["x-ratelimit-requests-reset"];
  return Object.freeze({
    ...(requestsLimit === undefined ? {} : { requestsLimit }),
    ...(requestsRemaining === undefined ? {} : { requestsRemaining }),
    ...(requestsReset === undefined ? {} : { requestsReset }),
  });
}

function metadata(input: {
  readonly host: string;
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}): InsightSentryEntitlementMetadata {
  return Object.freeze({
    host: input.host,
    path: ENTITLEMENT_PATH,
    providerStatus: input.status,
    responseBytes: Buffer.byteLength(input.body, "utf8"),
    quotaHeaders: quotaHeaders(input.headers),
  });
}

export async function probeInsightSentryEntitlement(input: {
  readonly configuration: InsightSentryConfigResult;
  readonly transport: InsightSentryProbeTransport;
}): Promise<InsightSentryEntitlement> {
  switch (input.configuration.status) {
    case "not_configured":
      return Object.freeze({
        status: "not_configured",
        reason: input.configuration.reason,
      });
    case "available": {
      const config = input.configuration.config;
      const response = ProbeResponseSchema.parse(
        await input.transport({
          url: `https://${config.rapidApiHost}${ENTITLEMENT_PATH}?query=NVDA`,
          headers: config.requestHeaders(),
        }),
      );
      const sanitizedMetadata = metadata({
        host: config.rapidApiHost,
        status: response.status,
        body: response.body,
        headers: response.headers,
      });
      if (response.status >= 200 && response.status < 300)
        return Object.freeze({
          status: "available",
          metadata: sanitizedMetadata,
        });
      if (response.status === 401)
        return Object.freeze({
          status: "not_configured",
          reason: "unauthorized",
          metadata: sanitizedMetadata,
        });
      if (response.status === 403)
        return Object.freeze({
          status: "subscription_required",
          metadata: sanitizedMetadata,
        });
      throw new InsightSentryEntitlementProbeError(
        "unexpected_status",
        response.status,
      );
    }
    default:
      return assertNeverConfiguration(input.configuration);
  }
}

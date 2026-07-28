import { describe, expect, it } from "vitest";
import { loadInsightSentryConfig } from "./insightSentryConfig";
import {
  type InsightSentryProbeTransport,
  probeInsightSentryEntitlement,
} from "./insightSentryEntitlement";

const CONFIGURED_ENVIRONMENT = {
  INSIGHTSENTRY_RAPIDAPI_KEY: "test-private-credential",
  INSIGHTSENTRY_RAPIDAPI_HOST: "insightsentry.p.rapidapi.com",
} as const;

function responseTransport(input: {
  readonly status: number;
  readonly body: string;
  readonly headers?: Readonly<Record<string, string>>;
}): InsightSentryProbeTransport {
  return async () => ({
    status: input.status,
    body: input.body,
    headers: input.headers ?? {},
  });
}

describe("InsightSentry entitlement probe", () => {
  it("does not call transport when configuration is absent", async () => {
    // Given
    const configuration = loadInsightSentryConfig({});
    let requestCount = 0;

    // When
    const result = await probeInsightSentryEntitlement({
      configuration,
      transport: async () => {
        requestCount += 1;
        return { status: 200, body: "{}", headers: {} };
      },
    });

    // Then
    expect(result).toEqual({
      status: "not_configured",
      reason: "missing_key",
    });
    expect(requestCount).toBe(0);
  });

  it("returns sanitized metadata for a successful single request", async () => {
    // Given
    const configuration = loadInsightSentryConfig(CONFIGURED_ENVIRONMENT);
    const requests: {
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
    }[] = [];
    const transport: InsightSentryProbeTransport = async (request) => {
      requests.push(request);
      return {
        status: 200,
        body: '{"results":[]}',
        headers: {
          "x-ratelimit-requests-limit": "50000",
          "x-ratelimit-requests-remaining": "49999",
          "x-untrusted-response":
            CONFIGURED_ENVIRONMENT.INSIGHTSENTRY_RAPIDAPI_KEY,
        },
      };
    };

    // When
    const result = await probeInsightSentryEntitlement({
      configuration,
      transport,
    });

    // Then
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      url: "https://insightsentry.p.rapidapi.com/v3/symbols/search?query=NVDA",
      headers: {
        Accept: "application/json",
        "x-rapidapi-host": "insightsentry.p.rapidapi.com",
        "x-rapidapi-key": CONFIGURED_ENVIRONMENT.INSIGHTSENTRY_RAPIDAPI_KEY,
      },
    });
    expect(result).toEqual({
      status: "available",
      metadata: {
        host: "insightsentry.p.rapidapi.com",
        path: "/v3/symbols/search",
        providerStatus: 200,
        responseBytes: 14,
        quotaHeaders: {
          requestsLimit: "50000",
          requestsRemaining: "49999",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain(
      CONFIGURED_ENVIRONMENT.INSIGHTSENTRY_RAPIDAPI_KEY,
    );
    expect(JSON.stringify(result)).not.toContain("x-rapidapi-key");
  });

  it("maps a 401 fixture to not_configured without returning its body", async () => {
    // Given
    const configuration = loadInsightSentryConfig(CONFIGURED_ENVIRONMENT);

    // When
    const result = await probeInsightSentryEntitlement({
      configuration,
      transport: responseTransport({
        status: 401,
        body: '{"message":"invalid credential"}',
      }),
    });

    // Then
    expect(result).toEqual({
      status: "not_configured",
      reason: "unauthorized",
      metadata: {
        host: "insightsentry.p.rapidapi.com",
        path: "/v3/symbols/search",
        providerStatus: 401,
        responseBytes: 32,
        quotaHeaders: {},
      },
    });
  });

  it("maps a 403 fixture to subscription_required", async () => {
    // Given
    const configuration = loadInsightSentryConfig(CONFIGURED_ENVIRONMENT);

    // When
    const result = await probeInsightSentryEntitlement({
      configuration,
      transport: responseTransport({
        status: 403,
        body: '{"message":"You are not subscribed to this API."}',
      }),
    });

    // Then
    expect(result).toEqual({
      status: "subscription_required",
      metadata: {
        host: "insightsentry.p.rapidapi.com",
        path: "/v3/symbols/search",
        providerStatus: 403,
        responseBytes: 49,
        quotaHeaders: {},
      },
    });
  });
});

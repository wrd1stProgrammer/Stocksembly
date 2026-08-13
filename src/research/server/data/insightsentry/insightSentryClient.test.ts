import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  canonicalInsightSentryCacheKey,
  createInsightSentryClient,
  INSIGHTSENTRY_MAX_RESPONSE_BYTES,
  InsightSentryClientError,
} from "./insightSentryClient";
import { loadInsightSentryConfig } from "./insightSentryConfig";
import {
  readInsightSentryQuotaObservation,
  readInsightSentryRetryIntent,
} from "./insightSentryQuota";
import {
  InsightSentryTransportError,
  type InsightSentryWireAdapter,
  type InsightSentryWireResponse,
} from "./insightSentryTransport";

const CONFIGURATION = loadInsightSentryConfig({
  INSIGHTSENTRY_RAPIDAPI_KEY: "fixture-private-credential",
  INSIGHTSENTRY_RAPIDAPI_HOST: "insightsentry.p.rapidapi.com",
});
const PayloadSchema = z
  .object({ value: z.string(), updatedAt: z.string().datetime() })
  .strict();
const NOW = Date.parse("2026-07-24T00:00:00.000Z");

class ExpectedFixtureError extends Error {
  readonly name = "ExpectedFixtureError";
}

class FixtureConnectionResetError extends Error {
  readonly name = "FixtureConnectionResetError";
}

async function dataRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "insightsentry-client-"));
}

function response(
  status: number,
  body: string,
  headers: Readonly<Record<string, string>> = {
    "content-type": "application/json",
  },
  abort: () => void = () => undefined,
): InsightSentryWireResponse {
  return {
    status,
    headers,
    body: (async function* () {
      yield Buffer.from(body);
    })(),
    abort,
  };
}

function request(value = "NVDA") {
  return {
    endpoint: "symbols.search",
    pathSegments: ["symbols", "search"] as const,
    parameters: { z: 2, query: value, a: true },
    adjustmentFlags: { split: true, dadj: false },
    asOfBucket: "2026-07-24",
    schema: PayloadSchema,
    cacheTtlMilliseconds: 60_000,
    freshness: {
      maxAgeMilliseconds: 86_400_000,
      timestamp: (payload: z.infer<typeof PayloadSchema>) => payload.updatedAt,
    },
  } as const;
}

function client(options: {
  readonly root: string;
  readonly adapter: InsightSentryWireAdapter;
  readonly random?: () => number;
}) {
  return createInsightSentryClient({
    configuration: CONFIGURATION,
    dataRoot: options.root,
    adapter: options.adapter,
    clock: {
      now: () => NOW,
      isoNow: () => new Date(NOW).toISOString(),
    },
    sleep: () => Promise.resolve(),
    random: options.random ?? (() => 0),
  });
}

async function capturedError(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    if (error instanceof InsightSentryClientError) return error;
    throw error;
  }
  throw new ExpectedFixtureError("Expected InsightSentryClientError");
}

describe("InsightSentry client", () => {
  it("builds the canonical secret-free cache key", () => {
    // Given
    const input = request("NVDA / A");

    // When
    const key = canonicalInsightSentryCacheKey(input);

    // Then
    expect(key).toBe(
      "v3|symbols.search|symbols/search|a=true&query=NVDA%20%2F%20A&z=2|dadj=false&split=true|2026-07-24",
    );
    expect(key).not.toContain("credential");
  });

  it("single-flights identical concurrent GETs and reuses the durable cache", async () => {
    // Given
    const root = await dataRoot();
    let upstreamCalls = 0;
    const adapter: InsightSentryWireAdapter = async () => {
      upstreamCalls += 1;
      return response(
        200,
        '{"value":"ok","updatedAt":"2026-07-24T00:00:00.000Z"}',
        {
          "content-type": "application/json",
          "x-ratelimit-requests-limit": "50000",
          "x-ratelimit-requests-remaining": "49999",
        },
      );
    };
    const firstClient = client({ root, adapter });

    // When
    const results = await Promise.all([
      firstClient.get(request()),
      firstClient.get(request()),
      firstClient.get(request()),
    ]);
    const cached = await client({ root, adapter }).get(request());

    // Then
    expect(results.map((result) => result.data.value)).toEqual([
      "ok",
      "ok",
      "ok",
    ]);
    expect(cached.cacheStatus).toBe("hit");
    expect(upstreamCalls).toBe(1);
    expect(await readInsightSentryQuotaObservation(root)).toMatchObject({
      limit: 50000,
      remaining: 49999,
    });
  });

  it("single-flights identical cache fills across independent clients", async () => {
    // Given
    const root = await dataRoot();
    let upstreamCalls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const adapter: InsightSentryWireAdapter = async () => {
      upstreamCalls += 1;
      if (upstreamCalls === 1) firstStarted();
      await gate;
      return response(
        200,
        '{"value":"ok","updatedAt":"2026-07-24T00:00:00.000Z"}',
      );
    };

    try {
      const first = client({ root, adapter }).get(request());
      await started;
      const second = client({ root, adapter }).get(request());
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      const callsBeforeRelease = upstreamCalls;
      release();

      // When
      const results = await Promise.all([first, second]);

      // Then
      expect(callsBeforeRelease).toBe(1);
      expect(upstreamCalls).toBe(1);
      expect(results.map((result) => result.data.value)).toEqual(["ok", "ok"]);
      expect(results.map((result) => result.cacheStatus).sort()).toEqual([
        "hit",
        "miss",
      ]);
    } finally {
      release();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs sequentially while quota headers are unknown", async () => {
    // Given
    const root = await dataRoot();
    let active = 0;
    let maximumActive = 0;
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    let calls = 0;
    const api = client({
      root,
      adapter: async () => {
        calls += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (calls === 1) {
          firstStarted();
          await firstGate;
        }
        active -= 1;
        return response(
          200,
          '{"value":"ok","updatedAt":"2026-07-24T00:00:00.000Z"}',
        );
      },
    });

    // When
    const pending = [api.get(request("A")), api.get(request("B"))];
    await started;
    const activeBeforeRelease = active;
    releaseFirst();
    await Promise.all(pending);

    // Then
    expect(activeBeforeRelease).toBe(1);
    expect(maximumActive).toBe(1);
  });

  it("shares the unknown-quota concurrency gate across independent clients", async () => {
    const root = await dataRoot();
    let active = 0;
    let maximumActive = 0;
    let releaseFirst: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let calls = 0;
    const adapter: InsightSentryWireAdapter = async () => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (calls === 1) {
        markStarted();
        await gate;
      }
      active -= 1;
      return response(
        200,
        '{"value":"ok","updatedAt":"2026-07-24T00:00:00.000Z"}',
      );
    };

    try {
      const first = client({ root, adapter }).get(request("A"));
      await started;
      const second = client({ root, adapter }).get(request("B"));
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      const activeBeforeRelease = active;
      releaseFirst();
      await Promise.all([first, second]);

      expect(activeBeforeRelease).toBe(1);
      expect(maximumActive).toBe(1);
    } finally {
      releaseFirst();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("allows at most two requests after quota becomes known", async () => {
    // Given
    const root = await dataRoot();
    let calls = 0;
    let active = 0;
    let maximumActive = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let twoStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      twoStarted = resolve;
    });
    const api = client({
      root,
      adapter: async () => {
        calls += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (calls > 1) {
          if (active === 2) twoStarted();
          await gate;
        }
        active -= 1;
        return response(
          200,
          '{"value":"ok","updatedAt":"2026-07-24T00:00:00.000Z"}',
          {
            "content-type": "application/json",
            "x-ratelimit-requests-limit": "50000",
            "x-ratelimit-requests-remaining": "49999",
          },
        );
      },
    });
    await api.get(request("seed"));

    // When
    const pending = [
      api.get(request("A")),
      api.get(request("B")),
      api.get(request("C")),
    ];
    await started;
    const activeBeforeRelease = active;
    release();
    await Promise.all(pending);

    // Then
    expect(activeBeforeRelease).toBe(2);
    expect(maximumActive).toBe(2);
  });

  it.each([
    [401, "unauthorized"],
    [403, "subscription_required"],
  ] as const)(
    "classifies %i as a permanent limitation",
    async (status, code) => {
      // Given
      const root = await dataRoot();
      let upstreamCalls = 0;
      const api = client({
        root,
        adapter: async () => {
          upstreamCalls += 1;
          return response(status, '{"message":"denied"}');
        },
      });

      // When
      const error = await capturedError(() => api.get(request()));

      // Then
      expect(error).toMatchObject({ code, retry: "never", status });
      expect(upstreamCalls).toBe(1);
      expect(JSON.stringify(error)).not.toContain("fixture-private-credential");
    },
  );

  it("recovers when a transient request succeeds within three attempts", async () => {
    // Given
    const root = await dataRoot();
    let upstreamCalls = 0;
    const api = client({
      root,
      adapter: async () => {
        upstreamCalls += 1;
        if (upstreamCalls < 3) {
          return response(503, "{}", {
            "content-type": "application/json",
            "retry-after": "0",
          });
        }
        return response(
          200,
          '{"value":"recovered","updatedAt":"2026-07-24T00:00:00.000Z"}',
        );
      },
    });

    // When
    const result = await api.get(request());

    // Then
    expect(result.data.value).toBe("recovered");
    expect(upstreamCalls).toBe(3);
  });

  it("stops after three exhausted transient attempts", async () => {
    // Given
    const root = await dataRoot();
    let upstreamCalls = 0;
    const api = client({
      root,
      adapter: async () => {
        upstreamCalls += 1;
        return response(503, "{}", {
          "content-type": "application/json",
          "retry-after": "0",
        });
      },
    });

    // When
    const error = await capturedError(() => api.get(request()));

    // Then
    expect(error).toMatchObject({ code: "server_error", retry: "durable" });
    expect(upstreamCalls).toBe(3);
  });

  it.each([
    [429, "rate_limited", "120", "2026-07-24T00:02:00.000Z"],
    [429, "rate_limited", undefined, "2026-07-24T00:00:04.000Z"],
    [500, "server_error", undefined, "2026-07-24T00:00:04.000Z"],
  ] as const)(
    "persists a durable retry for HTTP %i",
    async (status, code, retryAfter, expectedRetryAt) => {
      // Given
      const root = await dataRoot();
      const api = client({
        root,
        adapter: async () =>
          response(status, "{}", {
            "content-type": "application/json",
            ...(retryAfter === undefined ? {} : { "retry-after": retryAfter }),
          }),
      });

      // When
      const error = await capturedError(() => api.get(request()));
      const intent = await readInsightSentryRetryIntent(
        root,
        canonicalInsightSentryCacheKey(request()),
      );

      // Then
      expect(error).toMatchObject({ code, retry: "durable" });
      expect(intent).toMatchObject({
        classification: code,
        retryAt: expectedRetryAt,
      });
    },
  );

  it.each([
    ["connection reset", "network"],
    ["timeout", "timeout"],
  ] as const)(
    "persists a durable retry for %s failures",
    async (kind, code) => {
      // Given
      const root = await dataRoot();
      const api = client({
        root,
        adapter: async () => {
          if (kind === "timeout")
            throw new InsightSentryTransportError("timeout");
          throw new FixtureConnectionResetError("ECONNRESET");
        },
      });

      // When
      const error = await capturedError(() => api.get(request()));

      // Then
      expect(error).toMatchObject({ code, retry: "durable" });
      expect(
        await readInsightSentryRetryIntent(
          root,
          canonicalInsightSentryCacheKey(request()),
        ),
      ).toMatchObject({ classification: code });
    },
  );

  it.each([
    ["malformed JSON", "{broken", PayloadSchema, "non_json"],
    ["schema drift", '{"renamed":"field"}', PayloadSchema, "schema_drift"],
    [
      "stale success",
      '{"value":"old","updatedAt":"2026-07-20T00:00:00.000Z"}',
      PayloadSchema,
      "stale",
    ],
  ] as const)(
    "classifies %s without retry",
    async (_case, body, schema, code) => {
      // Given
      const root = await dataRoot();
      const api = client({
        root,
        adapter: async () => response(200, body),
      });

      // When
      const error = await capturedError(() =>
        api.get({ ...request(), schema }),
      );

      // Then
      expect(error).toMatchObject({ code, retry: "never" });
    },
  );

  it("caps raw bytes before JSON parsing", async () => {
    // Given
    const root = await dataRoot();
    let aborts = 0;
    const api = client({
      root,
      adapter: async () =>
        response(
          200,
          "x".repeat(INSIGHTSENTRY_MAX_RESPONSE_BYTES + 1),
          { "content-type": "application/json" },
          () => {
            aborts += 1;
          },
        ),
    });

    // When
    const error = await capturedError(() => api.get(request()));

    // Then
    expect(error).toMatchObject({ code: "oversized", retry: "never" });
    expect(aborts).toBe(1);
  });

  it("does not call the wire when the key is missing", async () => {
    // Given
    const root = await dataRoot();
    let calls = 0;
    const api = createInsightSentryClient({
      configuration: loadInsightSentryConfig({}),
      dataRoot: root,
      adapter: async () => {
        calls += 1;
        return response(200, "{}");
      },
    });

    // When
    const error = await capturedError(() => api.get(request()));

    // Then
    expect(error).toMatchObject({
      code: "missing_configuration",
      retry: "never",
    });
    expect(calls).toBe(0);
  });

  it("keeps persisted diagnostics free of credentials", async () => {
    // Given
    const root = await dataRoot();
    const api = client({
      root,
      adapter: async () => response(429, "{}", { "retry-after": "1" }),
    });

    // When
    await capturedError(() => api.get(request()));
    const state = await readFile(
      join(root, "insightsentry", "retry-intents.json"),
      "utf8",
    );

    // Then
    expect(state).not.toContain("fixture-private-credential");
    expect(state).not.toContain("x-rapidapi-key");
  });
});

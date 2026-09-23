import * as Sentry from "@sentry/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observePool } from "./metrics";
import { scrubMetric, scrubTransaction } from "./privacy";
import { sampleRate } from "./server";

vi.mock("@sentry/node", () => ({
  isInitialized: vi.fn(() => true),
  metrics: { gauge: vi.fn(), count: vi.fn() },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("bounded performance telemetry", () => {
  it("aggregates connection acquisitions once per minute without querying the DB", () => {
    vi.useFakeTimers();
    vi.stubEnv("SENTRY_METRICS_ENABLED", "true");
    vi.spyOn(Sentry, "isInitialized").mockReturnValue(true);
    const gauge = vi
      .spyOn(Sentry.metrics, "gauge")
      .mockImplementation(() => {});
    const count = vi
      .spyOn(Sentry.metrics, "count")
      .mockImplementation(() => {});
    const pool = {
      totalCount: 4,
      idleCount: 0,
      waitingCount: 2,
      options: {
        max: 4,
        maxUses: Infinity,
        allowExitOnIdle: false,
        maxLifetimeSeconds: 0,
        idleTimeoutMillis: 30_000,
      },
      ending: false,
    };
    const record = observePool(pool, "research");
    record(10, false);
    record(90, true);
    expect(gauge).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(gauge).toHaveBeenCalledWith(
      "db.pool.acquire.mean",
      50,
      expect.any(Object),
    );
    expect(gauge).toHaveBeenCalledWith(
      "db.pool.waiting",
      2,
      expect.any(Object),
    );
    expect(count).toHaveBeenCalledWith(
      "db.pool.acquire.failures",
      1,
      expect.any(Object),
    );
    gauge.mockClear();
    pool.ending = true;
    vi.advanceTimersByTime(60_000);
    expect(gauge).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps metrics low-cardinality and preserves only safe profiling linkage", () => {
    const metric = scrubMetric(
      {
        name: "db.pool.waiting",
        type: "gauge",
        value: 2,
        attributes: {
          pool: "research",
          email: "secret",
          runId: "secret",
          "sentry.environment": "verification",
        },
      },
      "worker",
    );
    expect(metric?.attributes).toEqual({
      runtime: "worker",
      pool: "research",
      "sentry.environment": "verification",
    });
    expect(
      scrubMetric({ name: "secret", type: "gauge", value: 1 }, "web"),
    ).toBeNull();
    const event = scrubTransaction({
      type: "transaction",
      contexts: Object.fromEntries([
        ["profile", { profiler_id: "a".repeat(32), question: "secret" }],
      ]),
    });
    expect(event.contexts?.profile?.["profiler_id"]).toBe("a".repeat(32));
    expect(JSON.stringify(event)).not.toContain("secret");
  });

  it("accepts an explicit zero and rejects malformed sampling configuration", () => {
    expect(sampleRate("0", 0.1)).toBe(0);
    for (const value of [undefined, "", "NaN", "-1", "2"])
      expect(sampleRate(value, 0.1)).toBe(0.1);
  });
});

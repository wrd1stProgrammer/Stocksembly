import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminAnalyticsReadsEnabled,
  adminAnalyticsWritesEnabled,
} from "./adminAnalyticsFlags";

describe("admin analytics rollout flags", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults both gates off", () => {
    vi.stubEnv("STOCKSEMBLY_ADMIN_ANALYTICS_READS_ENABLED", "");
    vi.stubEnv("STOCKSEMBLY_ADMIN_ANALYTICS_WRITES_ENABLED", "");
    expect(adminAnalyticsReadsEnabled()).toBe(false);
    expect(adminAnalyticsWritesEnabled()).toBe(false);
  });

  it("accepts only the exact true string", () => {
    vi.stubEnv("STOCKSEMBLY_ADMIN_ANALYTICS_READS_ENABLED", "true");
    vi.stubEnv("STOCKSEMBLY_ADMIN_ANALYTICS_WRITES_ENABLED", "TRUE");
    expect(adminAnalyticsReadsEnabled()).toBe(true);
    expect(adminAnalyticsWritesEnabled()).toBe(false);
  });
});

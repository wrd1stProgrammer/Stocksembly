import { describe, expect, it } from "vitest";
import {
  ONBOARDING_DISCOVERY_SOURCES,
  storedOnboardingDiscoverySource,
} from "./onboarding";

describe("stored onboarding discovery categories", () => {
  it("accepts every displayed platform without violating the existing database constraint", () => {
    const storedCategories = [
      "search",
      "youtube",
      "social",
      "community",
      "recommendation",
      "other",
      "prefer_not_to_say",
    ];
    for (const source of ONBOARDING_DISCOVERY_SOURCES) {
      expect(storedCategories).toContain(
        storedOnboardingDiscoverySource(source),
      );
    }
    expect(storedOnboardingDiscoverySource("google")).toBe("search");
    expect(storedOnboardingDiscoverySource("instagram")).toBe("social");
    expect(storedOnboardingDiscoverySource("recommendation")).toBe(
      "recommendation",
    );
  });
});

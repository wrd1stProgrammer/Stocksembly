import posthog from "posthog-js";
import { afterEach, expect, it, vi } from "vitest";
import { trackOnboardingEvent } from "./client";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("./config", () => ({ posthogEnabled: true }));
vi.mock("./googleClient", () => ({ trackGoogleProductEvent: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("does not collect detailed funnel events without consent", () => {
  trackOnboardingEvent("onboarding_paywall_viewed", { locale: "en" });
  expect(posthog.capture).not.toHaveBeenCalled();
});

it("sends funnel properties only while consent is granted", () => {
  const consent = vi
    .spyOn(document, "cookie", "get")
    .mockReturnValue("stocksembly_analytics_consent=granted");
  const properties = { locale: "en", progress_percent: 50 };
  trackOnboardingEvent("onboarding_sample_progress", properties);
  expect(posthog.capture).toHaveBeenCalledWith(
    "onboarding_sample_progress",
    properties,
  );
  consent.mockReturnValue("stocksembly_analytics_consent=denied");
  trackOnboardingEvent("onboarding_paywall_viewed", { locale: "en" });
  expect(posthog.capture).toHaveBeenCalledTimes(1);
});

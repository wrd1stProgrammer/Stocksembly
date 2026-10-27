"use client";

import posthog from "posthog-js";
import { posthogEnabled } from "./config";
import { trackGoogleProductEvent } from "./googleClient";

export type ProductEvent =
  | "signup_confirmed"
  | "research_started"
  | "report_viewed"
  | "agent_question_sent"
  | "checkout_started"
  | "interests_saved"
  | "onboarding_completed"
  | "plans_opened";

export type OnboardingEvent =
  | "onboarding_sample_requested"
  | "onboarding_sample_load_failed"
  | "onboarding_sample_loaded"
  | "onboarding_sample_started"
  | "onboarding_sample_progress"
  | "onboarding_sample_paused"
  | "onboarding_sample_resumed"
  | "onboarding_sample_speed_changed"
  | "onboarding_sample_completed"
  | "onboarding_sample_skipped"
  | "onboarding_paywall_viewed"
  | "onboarding_paywall_dismissed"
  | "onboarding_paywall_plans_clicked"
  | "onboarding_plans_closed";

// Deliberately exclude free-text questions and personal identifiers.
export type OnboardingEventProperties = {
  sample_symbol?: string;
  locale: string;
  progress_percent?: number;
  playback_rate?: number;
  completion_reason?: "completed" | "skipped";
  attempt?: number;
};

export function trackOnboardingEvent(
  event: OnboardingEvent,
  properties: OnboardingEventProperties,
): void {
  if (!analyticsConsent()) return;
  if (posthogEnabled) posthog.capture(event, properties);
}

export function analyticsConsent(): boolean {
  return (
    typeof document !== "undefined" &&
    document.cookie
      .split(";")
      .some((part) => part.trim() === "stocksembly_analytics_consent=granted")
  );
}

export function trackProductEvent(event: ProductEvent): void {
  if (!analyticsConsent()) return;
  if (posthogEnabled) posthog.capture(event);
  trackGoogleProductEvent(event);
}

export function resetProductIdentity(): void {
  if (analyticsConsent()) posthog.reset();
}

export function stopProductAnalytics(): void {
  posthog.stopSessionRecording();
  posthog.opt_out_capturing();
  posthog.reset();
}

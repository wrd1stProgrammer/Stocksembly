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

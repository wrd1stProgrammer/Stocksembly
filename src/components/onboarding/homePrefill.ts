import {
  type OnboardingResearch,
  onboardingResearchSchema,
} from "./onboardingJourney";

export const HOME_PREFILL_KEY = "stocksembly.onboarding.home-prefill";
export const HOME_PREFILL_EVENT = "stocksembly:onboarding-home-prefill";

export function saveHomePrefill(draft: OnboardingResearch) {
  sessionStorage.setItem(HOME_PREFILL_KEY, JSON.stringify(draft));
}

export function consumeHomePrefill(): OnboardingResearch | undefined {
  const raw = sessionStorage.getItem(HOME_PREFILL_KEY);
  if (!raw) return;
  sessionStorage.removeItem(HOME_PREFILL_KEY);
  try {
    const parsed = onboardingResearchSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return;
  }
}

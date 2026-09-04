export const CURRENT_ONBOARDING_VERSION = 1;

export const ONBOARDING_DISCOVERY_SOURCES = [
  "search",
  "youtube",
  "social",
  "community",
  "recommendation",
  "other",
  "prefer_not_to_say",
] as const;

export type OnboardingDiscoverySource =
  (typeof ONBOARDING_DISCOVERY_SOURCES)[number];

export function isOnboardingDiscoverySource(
  value: unknown,
): value is OnboardingDiscoverySource {
  return ONBOARDING_DISCOVERY_SOURCES.includes(
    value as OnboardingDiscoverySource,
  );
}

export const ONBOARDING_DISCOVERY_SOURCE_LABELS_KO: Readonly<
  Record<OnboardingDiscoverySource, string>
> = {
  search: "검색",
  youtube: "유튜브",
  social: "소셜 미디어",
  community: "투자 커뮤니티",
  recommendation: "지인 추천",
  other: "기타",
  prefer_not_to_say: "응답하지 않음",
};

import type {
  AcquisitionAttributionInput,
  AcquisitionChannel,
} from "./analyticsContracts";

const SOCIAL_MEDIA = new Set([
  "facebook",
  "instagram",
  "linkedin",
  "threads",
  "threads.net",
  "x",
  "twitter",
  "youtube",
  "tiktok",
]);

const SOCIAL_MEDIUMS = new Set([
  "organic_social",
  "paid_social",
  "social",
  "social_media",
]);

const SEARCH_REFERRERS = new Set([
  "google.com",
  "bing.com",
  "search.naver.com",
  "search.daum.net",
]);

export function acquisitionChannel(
  attribution: AcquisitionAttributionInput,
): Exclude<AcquisitionChannel, "all" | "unknown"> {
  const medium = attribution.medium?.toLowerCase();
  const source = attribution.source?.toLowerCase();
  const referrer = attribution.referrerHost?.toLowerCase();
  if (medium === "cpc" || medium === "ppc" || medium === "paid_search")
    return "paid_search";
  if (medium === "email") return "email";
  if (
    SOCIAL_MEDIUMS.has(medium ?? "") ||
    SOCIAL_MEDIA.has(source ?? "") ||
    referrer === "threads.net" ||
    referrer?.endsWith(".threads.net")
  )
    return "social";
  if (
    medium === "organic" ||
    medium === "organic_search" ||
    SEARCH_REFERRERS.has(referrer ?? "")
  )
    return "organic_search";
  if (referrer) return "referral";
  if (
    attribution.source ||
    attribution.medium ||
    attribution.campaign ||
    attribution.term ||
    attribution.content
  )
    return "campaign";
  return "direct";
}

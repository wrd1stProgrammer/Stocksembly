import type { Locale } from "../lib/i18n";

export const PUBLIC_STANCE_LABELS = {
  upside_skewed: { en: "Upside skewed", ko: "상방 우위" },
  wait_for_proof: { en: "Wait for proof", ko: "확인 대기" },
  downside_skewed: { en: "Downside skewed", ko: "하방 우위" },
  balanced: { en: "Balanced", ko: "균형" },
  insufficient_evidence: { en: "Insufficient evidence", ko: "근거 부족" },
} as const;

export type PublicStance = keyof typeof PUBLIC_STANCE_LABELS;

export function publicStanceLabel(
  stance: PublicStance,
  locale: Locale,
): string {
  return PUBLIC_STANCE_LABELS[stance][locale];
}

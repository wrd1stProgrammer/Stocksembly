import type { ResearchLocale } from "../i18n";

export function researchReportSeoTitle(
  symbol: string,
  question: string,
  locale: ResearchLocale,
): string {
  return locale === "ko"
    ? `${symbol} 미국주식 분석: ${question}`
    : `${symbol} Stock Analysis: ${question}`;
}

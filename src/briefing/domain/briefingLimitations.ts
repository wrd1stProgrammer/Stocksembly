import type { Locale } from "../../lib/i18n";

const LIMITATION_COPY: Record<string, Record<Locale, string>> = {
  quote: {
    ko: "실시간 시세를 확인하지 못했습니다.",
    en: "The live quote could not be verified.",
  },
  market_daily: {
    ko: "전일 가격 기준선을 확인하지 못했습니다.",
    en: "The prior-session price reference could not be verified.",
  },
  technical_4h: {
    ko: "4시간봉 기술 기준을 확인하지 못했습니다.",
    en: "The 4-hour technical reference could not be verified.",
  },
  company_info: {
    ko: "기업 정보와 실적 보조 데이터를 일부 확인하지 못했습니다.",
    en: "Some company and supplemental earnings data could not be verified.",
  },
  news: {
    ko: "뉴스 수집 결과가 일부 누락됐습니다.",
    en: "Some news collection results are unavailable.",
  },
  documents: {
    ko: "회사 공시·문서 수집 결과가 일부 누락됐습니다.",
    en: "Some company filing and document results are unavailable.",
  },
  calendar: {
    ko: "향후 일정 수집 결과가 일부 누락됐습니다.",
    en: "Some upcoming calendar results are unavailable.",
  },
  fundamentals: {
    ko: "핵심 재무 지표 수집 결과가 일부 누락됐습니다.",
    en: "Some core fundamental metrics are unavailable.",
  },
};

export function localizeBriefingLimitation(
  limitation: string,
  locale: Locale,
): string {
  return LIMITATION_COPY[limitation]?.[locale] ?? limitation;
}

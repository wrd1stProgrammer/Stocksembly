import type { AnalyticsEventName } from "./analyticsContracts";
import { meaningfulAnalyticsEvents } from "./analyticsContracts";

export const adminMetricDefinitions = Object.freeze({
  signups: {
    label: "신규 가입자",
    description: "선택 기간에 Stocksembly에 처음 인증된 사용자",
  },
  dau: { label: "DAU", description: "오늘 의미 있는 행동을 한 사용자" },
  wau: { label: "WAU", description: "최근 7일 의미 있는 행동 사용자" },
  mau: { label: "MAU", description: "최근 30일 의미 있는 행동 사용자" },
  signupToPaid: {
    label: "가입 → 결제",
    description: "가입 후 30일 이내 결제한 사용자 비율",
  },
  activePaid: {
    label: "활성 유료 사용자",
    description: "현재 active 또는 trialing인 Pro·Ultra 사용자",
  },
} as const);

export const analyticsEventLabels: Readonly<
  Record<AnalyticsEventName, string>
> = Object.freeze({
  account_first_authenticated: "첫 로그인",
  research_started: "리서치 시작",
  research_completed: "리서치 완료",
  report_opened: "리포트 열람",
  consultation_submitted: "질문 등록",
  consultation_answered: "질문 답변 완료",
  briefing_opened: "브리핑 열람",
  briefing_read: "브리핑 읽음",
  watchlist_added: "관심종목 추가",
  watchlist_removed: "관심종목 삭제",
  checkout_started: "결제 이동 준비",
  payment_succeeded: "결제 성공",
  payment_failed: "결제 실패",
  membership_deactivated: "멤버십 종료",
  cancel_at_period_end_changed: "기간 종료 시 해지 예약",
});

export const meaningfulEventSet = new Set<AnalyticsEventName>(
  meaningfulAnalyticsEvents,
);

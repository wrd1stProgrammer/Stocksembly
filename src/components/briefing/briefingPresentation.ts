import { selectNextEarnings } from "../../briefing/domain/briefingEarnings";
import type {
  BriefingDecisionCheck,
  BriefingEarningsSnapshot,
  BriefingEditionPayload,
  BriefingUpcomingEvent,
} from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";

type BriefingCopy = {
  readonly citedSources: string;
  readonly earnings: string;
  readonly earningsPending: string;
  readonly earningsSnapshot: string;
  readonly latestRelease: string;
  readonly latestEps: string;
  readonly latestRevenue: string;
  readonly consensus: string;
  readonly epsSurprise: string;
  readonly revenueSurprise: string;
  readonly nextEpsConsensus: string;
  readonly nextRevenueConsensus: string;
  readonly changedSince: string;
  readonly changes: string;
  readonly extendedChanges: string;
  readonly noChanges: string;
  readonly source: string;
  readonly limitations: string;
  readonly observe: string;
  readonly confirmed: string;
  readonly weakened: string;
  readonly unclear: string;
  readonly estimated: string;
  readonly todayChecks: string;
  readonly nextCatalyst: string;
  readonly agentPaths: string;
  readonly bull: string;
  readonly bear: string;
  readonly close: string;
};

const COPY: Record<Locale, BriefingCopy> = {
  ko: {
    citedSources: "기사 원문",
    earnings: "다음 실적",
    earningsPending: "일정 미확정",
    earningsSnapshot: "실적 스냅샷",
    latestRelease: "최근 발표",
    latestEps: "최근 EPS",
    latestRevenue: "최근 분기 매출",
    consensus: "당시 컨센서스",
    epsSurprise: "EPS 서프라이즈",
    revenueSurprise: "매출 서프라이즈",
    nextEpsConsensus: "다음 EPS 컨센서스",
    nextRevenueConsensus: "다음 매출 컨센서스",
    changedSince: "전일 브리핑 이후",
    changes: "최근 24시간 변화",
    extendedChanges: "주말·휴장 이후 중요 변화",
    noChanges: "최근 24시간 동안 중요한 변화는 없었습니다.",
    source: "원문",
    limitations: "한계와 미확인 사항",
    observe: "관찰 지표",
    confirmed: "확인되면",
    weakened: "약화되면",
    unclear: "엇갈리면",
    estimated: "예상·미확정",
    todayChecks: "오늘 확인",
    nextCatalyst: "다음 촉매",
    agentPaths: "에이전트 해석과 상·하방 경로",
    bull: "상방 경로",
    bear: "하방 경로",
    close: "닫기",
  },
  en: {
    citedSources: "Linked articles",
    earnings: "Next earnings",
    earningsPending: "Date pending",
    earningsSnapshot: "Earnings snapshot",
    latestRelease: "Latest release",
    latestEps: "Latest EPS",
    latestRevenue: "Latest quarterly revenue",
    consensus: "Street consensus",
    epsSurprise: "EPS surprise",
    revenueSurprise: "Revenue surprise",
    nextEpsConsensus: "Next EPS consensus",
    nextRevenueConsensus: "Next revenue consensus",
    changedSince: "Since the prior briefing",
    changes: "Changes in the last 24 hours",
    extendedChanges: "Material changes after the weekend or holiday",
    noChanges: "No material changes in the last 24 hours.",
    source: "Source",
    limitations: "Limitations",
    observe: "Observe",
    confirmed: "If confirmed",
    weakened: "If weakened",
    unclear: "If mixed",
    estimated: "Estimated · unconfirmed",
    todayChecks: "Today’s checks",
    nextCatalyst: "Next catalysts",
    agentPaths: "Agent interpretation and upside/downside paths",
    bull: "Upside path",
    bear: "Downside path",
    close: "Close",
  },
};

export function briefingCopy(locale: Locale): BriefingCopy {
  return COPY[locale];
}

export function formatEarningsCurrency(
  value: number,
  earnings: BriefingEarningsSnapshot,
  compact = false,
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: earnings.currency ?? "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

export function formatEarningsPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function nextEarnings(
  edition: BriefingEditionPayload,
): BriefingUpcomingEvent | undefined {
  return selectNextEarnings(edition);
}

export function hasExtendedCoverage(edition: BriefingEditionPayload): boolean {
  return (
    Date.parse(edition.cutoffAt) - Date.parse(edition.coverageStart) >
    36 * 60 * 60 * 1_000
  );
}

export function isDecisionCheck(
  check: BriefingDecisionCheck | string,
): check is BriefingDecisionCheck {
  return typeof check !== "string";
}

type CheckWithHorizon = BriefingDecisionCheck & {
  readonly horizon?: "today" | "next_catalyst";
};

export function isNextCatalystCheck(check: BriefingDecisionCheck): boolean {
  const typedCheck: CheckWithHorizon = check;
  if (typedCheck.horizon === "next_catalyst") return true;
  if (typedCheck.horizon === "today") return false;
  return /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/u.test(check.timing);
}

export function safeExternalHref(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch (error) {
    if (error instanceof TypeError) return undefined;
    throw error;
  }
}

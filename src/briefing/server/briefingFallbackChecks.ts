import type { Locale } from "../../lib/i18n";
import type {
  BriefingDecisionCheck,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import {
  companyFinancialPhrase,
  formatBriefingPrice,
  technicalTrendLabel,
} from "./briefingFallbackFormatting";
import { nextEarningsEvent } from "./briefingSignalPolicy";
import type { BriefingDraft } from "./briefingSynthesisSchema";

type DecisionWindow = "opening" | "four_hour" | "close" | "next_open";

const BANK_TERMS = [
  {
    evidence: ["net interest income", "nii"],
    output: ["net interest income", "nii", "순이자이익"],
  },
  { evidence: ["credit costs"], output: ["credit costs", "신용비용"] },
  { evidence: ["reserves"], output: ["reserves", "대손충당금"] },
  { evidence: ["cet1"], output: ["cet1", "보통주자본비율"] },
  { evidence: ["rotce"], output: ["rotce", "유형보통주자본이익률"] },
] as const;

function containsExactPhrase(value: string, phrase: string): boolean {
  const searchable = value
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ");
  return ` ${searchable} `.includes(` ${phrase} `);
}

export function hasSupportedDecisionCompanyTerms(
  check: BriefingDecisionCheck,
  snapshot: BriefingSourceSnapshot,
): boolean {
  const text = [
    check.title,
    check.metric,
    check.confirmation,
    check.ifConfirmed,
    check.ifUnclear ?? "",
    check.ifFailed,
  ].join(" ");
  const evidence =
    snapshot.backgroundFinancialContext?.documents
      .map((document) => document.excerpt)
      .join(" ") ?? "";
  return BANK_TERMS.every(
    (term) =>
      !term.output.some((candidate) => containsExactPhrase(text, candidate)) ||
      term.evidence.some((candidate) =>
        containsExactPhrase(evidence, candidate),
      ),
  );
}

function newYorkMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  return hour * 60 + minute;
}

function decisionWindow(snapshot: BriefingSourceSnapshot): DecisionWindow {
  const state = snapshot.quote.marketState;
  if (state === "PRE") return "opening";
  if (state === "POST" || state === "CLOSED" || state === "HOLIDAYS")
    return "next_open";
  const minutes = newYorkMinutes(snapshot.cutoffAt);
  if (minutes < 10 * 60) return "opening";
  if (minutes < 13 * 60 + 30) return "four_hour";
  if (minutes < 16 * 60) return "close";
  return "next_open";
}

function decisionTiming(locale: Locale, window: DecisionWindow): string {
  const korean = {
    opening: "개장 후 30분 (10:00 ET)",
    four_hour: "13:30 ET 첫 4시간봉 마감",
    close: "정규장 종가 (16:00 ET)",
    next_open: "다음 정규장 개장 후 30분",
  } as const;
  const english = {
    opening: "30 minutes after the open (10:00 ET)",
    four_hour: "First 4h close at 13:30 ET",
    close: "Regular-session close (16:00 ET)",
    next_open: "30 minutes after the next regular-session open",
  } as const;
  return locale === "ko" ? korean[window] : english[window];
}

export function fallbackDecisionChecks(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
): BriefingDraft["todayChecks"] {
  const reference = snapshot.marketReference;
  const leadSignal = signals.find((signal) => signal.kind !== "price");
  const technical = snapshot.technicalReference;
  const window = decisionWindow(snapshot);
  const useTechnicalLevels = window === "four_hour" || window === "close";
  const upperValue =
    (useTechnicalLevels ? technical?.resistance : reference?.previousHigh) ??
    reference?.previousHigh ??
    technical?.resistance ??
    reference?.previousClose ??
    snapshot.quote.value;
  const lowerValue =
    (useTechnicalLevels ? technical?.support : reference?.previousLow) ??
    reference?.previousLow ??
    technical?.support ??
    reference?.previousClose ??
    snapshot.quote.value;
  const upper = formatBriefingPrice(
    upperValue === undefined || lowerValue === undefined
      ? upperValue
      : Math.max(upperValue, lowerValue),
  );
  const lower = formatBriefingPrice(
    upperValue === undefined || lowerValue === undefined
      ? lowerValue
      : Math.min(upperValue, lowerValue),
  );
  const timing = decisionTiming(locale, window);
  const priceCheck: BriefingDraft["todayChecks"][number] =
    locale === "ko"
      ? {
          horizon: "today",
          title:
            leadSignal === undefined
              ? window === "four_hour"
                ? "첫 4시간봉이 기존 판단을 지키는가"
                : window === "close"
                  ? "종가가 기존 판단을 지키는가"
                  : "개장 가격대가 기존 판단을 지키는가"
              : window === "four_hour"
                ? "첫 4시간봉이 뉴스 방향을 확인하는가"
                : window === "close"
                  ? "종가가 뉴스 방향을 확인하는가"
                  : "초기 수급이 뉴스 방향을 확인하는가",
          timing,
          metric: `가격 판정 범위 · 상단 ${upper ?? "미확인"} / 하단 ${lower ?? "미확인"}${useTechnicalLevels && technical?.trend !== undefined ? ` / 4시간봉 ${technicalTrendLabel(locale, technical.trend)} 추세` : ""}`,
          confirmation: `판정 시점 가격이 ${upper ?? "상단 가격 기준"} 위인 경우`,
          ifConfirmed:
            leadSignal === undefined
              ? "가격이 상단 기준을 받아들였다는 근거가 강해집니다."
              : "새 사건이 당일 수급으로 연결됐다는 근거가 강해집니다.",
          ifUnclear: `가격이 ${lower ?? "하단 가격 기준"}부터 ${upper ?? "상단 가격 기준"} 사이면 기존 판단을 유지합니다.`,
          ifFailed: `판정 시점 가격이 ${lower ?? "하단 가격 기준"} 아래면 가격 확인은 실패한 것으로 봅니다.`,
        }
      : {
          horizon: "today",
          title:
            leadSignal === undefined
              ? window === "four_hour"
                ? "Does the first 4h close preserve the current view?"
                : window === "close"
                  ? "Does the close preserve the current view?"
                  : "Does the opening range preserve the current view?"
              : window === "four_hour"
                ? "Does the first 4h close confirm the news direction?"
                : window === "close"
                  ? "Does the close confirm the news direction?"
                  : "Does the opening tape confirm the news direction?",
          timing,
          metric: `Price decision range · upper ${upper ?? "pending"} / lower ${lower ?? "pending"}${useTechnicalLevels && technical?.trend !== undefined ? ` / 4h ${technicalTrendLabel(locale, technical.trend)} trend` : ""}`,
          confirmation: `Price at the decision time is above ${upper ?? "the upper price reference"}.`,
          ifConfirmed:
            leadSignal === undefined
              ? "Evidence strengthens that price accepted the upper reference."
              : "Evidence strengthens that the new event translated into same-day demand.",
          ifUnclear: `Price from ${lower ?? "the lower price reference"} through ${upper ?? "the upper price reference"} preserves the current view.`,
          ifFailed: `Price below ${lower ?? "the lower price reference"} fails the price test.`,
        };
  const nextEvent = nextEarningsEvent(snapshot);
  if (nextEvent === undefined) return [priceCheck];
  const earnings = snapshot.earnings;
  const forecast = earnings?.nextEpsForecast;
  if (forecast === undefined) return [priceCheck];
  const threshold = forecast.toFixed(2);
  const companyWatch = companyFinancialPhrase(locale, snapshot);
  const eventName =
    locale === "ko" ? `${snapshot.symbol} 실적 발표` : nextEvent.name;
  const date = nextEvent.scheduledAt.slice(0, 10);
  const catalystTiming =
    nextEvent.certainty !== "confirmed"
      ? `${date} (${locale === "ko" ? "예상" : "estimated"})`
      : date;
  const eventCheck: BriefingDraft["todayChecks"][number] =
    locale === "ko"
      ? {
          horizon: "next_catalyst",
          title: "다음 보고서 EPS가 현재 컨센서스를 충족하는가",
          timing: catalystTiming,
          metric: `${eventName} · 현재 다음 보고서 EPS 컨센서스 ${threshold}${companyWatch === undefined ? "" : ` · 보조 관찰: ${companyWatch}`}`,
          confirmation: `보고 EPS ≥ ${threshold}이면 확인입니다.`,
          ifConfirmed: "현재 다음 보고서 EPS 컨센서스를 충족하거나 웃돕니다.",
          ifUnclear: "보고 EPS가 없거나 아직 발표되지 않았으면 불명확입니다.",
          ifFailed: `보고 EPS < ${threshold}이면 현재 다음 보고서 EPS 컨센서스에 미달합니다.`,
        }
      : {
          horizon: "next_catalyst",
          title:
            "Does reported EPS meet the current next-report EPS consensus?",
          timing: catalystTiming,
          metric: `${eventName} · current next-report EPS consensus ${threshold}${companyWatch === undefined ? "" : ` · Secondary watch: ${companyWatch}`}`,
          confirmation: `Confirmed when reported EPS ≥ ${threshold}.`,
          ifConfirmed:
            "Reported EPS meets or exceeds the current next-report EPS consensus.",
          ifUnclear:
            "EPS is unavailable or not yet reported, so the result is unclear.",
          ifFailed: `Failed when reported EPS < ${threshold}.`,
        };
  return [priceCheck, eventCheck];
}

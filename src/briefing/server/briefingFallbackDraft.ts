import type { Locale } from "../../lib/i18n";
import type {
  BriefingEditionPayload,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import { fallbackDecisionChecks } from "./briefingFallbackChecks";
import {
  compactBriefingDate,
  earningsEventWhyItMatters,
  formatBriefingPrice,
  localizedInvestmentMeaning,
  localizedSignalDetail,
  localizedSignalHeadline,
} from "./briefingFallbackFormatting";
import { fallbackAgentViews } from "./briefingFallbackViews";
import {
  isEarningsEventName,
  nextEarningsEvent,
  publicUpcomingEvents,
} from "./briefingSignalPolicy";
import type { BriefingDraft } from "./briefingSynthesisSchema";

type FallbackDraftInput = {
  readonly locale: Locale;
  readonly snapshot: BriefingSourceSnapshot;
  readonly signals: readonly BriefingSignal[];
  readonly previous: BriefingEditionPayload | undefined;
};

export function fallbackBriefingDraft(
  input: FallbackDraftInput,
): BriefingDraft {
  const { locale, previous, signals, snapshot } = input;
  const change = snapshot.quote.changePercent;
  const move =
    change === undefined
      ? locale === "ko"
        ? "가격 확인 전"
        : "price pending"
      : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
  const companyChanges = signals.filter((signal) => signal.kind !== "price");
  const leadSignal = companyChanges[0];
  const coverageHours =
    Date.parse(snapshot.cutoffAt) - Date.parse(snapshot.coverageStart);
  const extendedCoverage = coverageHours > 36 * 60 * 60 * 1_000;
  const coverageLabel =
    locale === "ko"
      ? extendedCoverage
        ? "직전 브리핑 이후"
        : "최근 24시간"
      : extendedCoverage
        ? "since the prior briefing"
        : "in the last 24 hours";
  const nextEarnings = nextEarningsEvent(snapshot);
  const currentPrice = formatBriefingPrice(snapshot.quote.value);
  const priorClose = formatBriefingPrice(
    snapshot.marketReference?.previousClose,
  );
  const priorHigh = formatBriefingPrice(snapshot.marketReference?.previousHigh);
  const priorLow = formatBriefingPrice(snapshot.marketReference?.previousLow);
  const technicalSupport = formatBriefingPrice(
    snapshot.technicalReference?.support,
  );
  const positiveSignal = companyChanges.find(
    (signal) => signal.direction === "positive",
  );
  const riskSignal = companyChanges.find(
    (signal) => signal.kind === "risk" || signal.direction === "negative",
  );
  const hasChanges = leadSignal !== undefined;
  const quietPriceRead =
    locale === "ko"
      ? currentPrice !== undefined &&
        priorClose !== undefined &&
        change !== undefined
        ? `현재 주가는 ${currentPrice}로 전일 종가 ${priorClose} 대비 ${move}입니다.`
        : currentPrice !== undefined
          ? `현재 주가는 ${currentPrice}입니다.`
          : "현재 가격은 아직 확인되지 않았습니다."
      : currentPrice !== undefined &&
          priorClose !== undefined &&
          change !== undefined
        ? `The latest price is ${currentPrice}, ${move} versus the ${priorClose} prior close.`
        : currentPrice !== undefined
          ? `The latest price is ${currentPrice}.`
          : "The latest price is still pending.";
  const belowPriorLow =
    snapshot.quote.value !== undefined &&
    snapshot.marketReference?.previousLow !== undefined &&
    snapshot.quote.value < snapshot.marketReference.previousLow;
  const belowPriorHigh =
    snapshot.quote.value !== undefined &&
    snapshot.marketReference?.previousHigh !== undefined &&
    snapshot.quote.value <= snapshot.marketReference.previousHigh;
  const bullTrigger =
    belowPriorLow && priorLow !== undefined
      ? locale === "ko"
        ? `${priorLow} 회복`
        : `a reclaim of ${priorLow}`
      : priorHigh === undefined
        ? locale === "ko"
          ? "판정 시점의 가격·거래 확인"
          : "price and trading confirmation at the decision window"
        : belowPriorHigh
          ? locale === "ko"
            ? `${priorHigh} 돌파 후 유지`
            : `a break above ${priorHigh} followed by a hold`
          : locale === "ko"
            ? `${priorHigh} 위 가격 유지`
            : `a hold above ${priorHigh}`;
  const supportAlreadyBroken =
    snapshot.quote.value !== undefined &&
    snapshot.technicalReference?.support !== undefined &&
    snapshot.quote.value <= snapshot.technicalReference.support;
  const bearTrigger =
    technicalSupport !== undefined && !supportAlreadyBroken
      ? locale === "ko"
        ? `${technicalSupport} 이탈`
        : `a break below ${technicalSupport}`
      : priorLow !== undefined && !belowPriorLow
        ? locale === "ko"
          ? `${priorLow} 이탈`
          : `a break below ${priorLow}`
        : locale === "ko"
          ? "추가 저점 형성과 거래 약화 지속"
          : "a lower low with persistently weaker trading";
  const subject =
    leadSignal === undefined
      ? `${snapshot.symbol}: ${coverageLabel} 새 사건 없음`
      : localizedSignalHeadline(locale, snapshot.symbol, leadSignal);
  const headline = hasChanges
    ? locale === "ko"
      ? `${subject} — 실적 추정치에 닿는지 판정할 차례`
      : `${subject} — now test whether it reaches estimates`
    : locale === "ko"
      ? `${snapshot.symbol}, 기업 고유 새 사건 없음 — ${nextEarnings === undefined ? "당일 가격 흐름이 첫 판단 기준" : `${compactBriefingDate(locale, nextEarnings.scheduledAt)}${nextEarnings.certainty === "estimated" ? " 예상" : ""} 실적이 다음 분기점`}`
      : `${snapshot.symbol}: no new company-specific event — ${nextEarnings === undefined ? "same-session price action is the first decision point" : `${nextEarnings.certainty === "estimated" ? "estimated " : ""}earnings on ${compactBriefingDate(locale, nextEarnings.scheduledAt)} is next`}`;
  const summary = hasChanges
    ? locale === "ko"
      ? `${localizedSignalDetail(locale, leadSignal)} ${localizedInvestmentMeaning(locale, leadSignal)}`
      : `${leadSignal.detail.slice(0, 230)} Its investment significance is ${leadSignal.investmentMeaning}`
    : locale === "ko"
      ? `새 공시·제품·수요 변화는 없었습니다. ${quietPriceRead} 이 움직임이 기존 논지 훼손인지 단기 변동인지 구분합니다.`
      : `No new filing, product, or demand change appeared. ${quietPriceRead} Distinguish a thesis break from short-term price noise.`;
  return {
    headline,
    summary,
    materialChanges: companyChanges.slice(0, 5).map((signal) => ({
      id: signal.id,
      title: localizedSignalHeadline(locale, snapshot.symbol, signal),
      detail: localizedSignalDetail(locale, signal),
      investmentMeaning: localizedInvestmentMeaning(locale, signal),
    })),
    agentViews: [...fallbackAgentViews(locale, snapshot, signals)],
    bullCase:
      locale === "ko"
        ? `상방 전제는 ${positiveSignal?.title ?? "실적 기대 유지"}입니다. 가격 조건은 ${bullTrigger}입니다. 두 조건이 함께 확인되면 논리가 강화됩니다.`
        : `Upside premise: ${positiveSignal?.title ?? "current operating expectations hold"}. Price condition: ${bullTrigger}. Together they strengthen the upside case.`,
    bearCase:
      locale === "ko"
        ? `하방 전제는 ${riskSignal?.title ?? "실적 기대 하향"}입니다. 가격 조건은 ${bearTrigger}입니다. 두 조건이 겹치면 부담이 커집니다.`
        : `Downside premise: ${riskSignal?.title ?? "missing operating follow-through"}. Price condition: ${bearTrigger}. Together they raise downside risk.`,
    upcomingEvents: publicUpcomingEvents(snapshot).map((event) => ({
      ...event,
      whyItMatters: isEarningsEventName(event.name)
        ? earningsEventWhyItMatters(locale, snapshot, event.whyItMatters)
        : event.whyItMatters,
      certainty: event.certainty ?? "estimated",
    })),
    todayChecks: [...fallbackDecisionChecks(locale, snapshot, signals)],
    changedSincePrevious:
      previous === undefined || !hasChanges
        ? null
        : locale === "ko"
          ? `전일 브리핑에 없던 새 신호 ${companyChanges.length}건을 반영했습니다.`
          : `${companyChanges.length} signal${companyChanges.length === 1 ? " is" : "s are"} new versus the prior briefing.`,
    stillWatching: null,
  };
}

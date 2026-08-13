import type { Locale } from "../../lib/i18n";
import type {
  BriefingAgentView,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import {
  compactBriefingCurrency,
  compactBriefingDate,
  companyFinancialPhrases,
  earningsRead,
  formatBriefingPrice,
  formattedFundamentalPercent,
  technicalTrendLabel,
} from "./briefingFallbackFormatting";
import { nextEarningsEvent } from "./briefingSignalPolicy";

export function fallbackAgentViews(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
): readonly BriefingAgentView[] {
  const change = snapshot.quote.changePercent;
  const move =
    change === undefined
      ? "pending"
      : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
  const technical = snapshot.technicalReference;
  const support = formatBriefingPrice(technical?.support);
  const resistance = formatBriefingPrice(technical?.resistance);
  const current = formatBriefingPrice(snapshot.quote.value);
  const priorHigh = formatBriefingPrice(snapshot.marketReference?.previousHigh);
  const priorLow = formatBriefingPrice(snapshot.marketReference?.previousLow);
  const companySignal = signals.find((signal) => signal.kind === "company");
  const riskSignal = signals.find(
    (signal) =>
      signal.kind === "risk" ||
      (signal.kind !== "price" && signal.direction === "negative"),
  );
  const revenueGrowth = formattedFundamentalPercent(
    snapshot,
    "revenue_one_year_growth_ttm",
  );
  const nextEvent = nextEarningsEvent(snapshot);
  const nextEventDate =
    nextEvent === undefined
      ? undefined
      : compactBriefingDate(locale, nextEvent.scheduledAt);
  const estimatedEvent = nextEvent?.certainty === "estimated";
  const earningsLine = earningsRead(locale, snapshot.earnings);
  const companyMetrics = companyFinancialPhrases(locale, snapshot);
  const companyMetric =
    companyMetrics.length === 0 ? undefined : companyMetrics.join(" · ");
  const nextEps = snapshot.earnings?.nextEpsForecast;
  const nextRevenue = snapshot.earnings?.nextRevenueForecast;
  const financialFocus = [
    companyMetric,
    nextEps === undefined
      ? "매출·마진"
      : `다음 보고서 EPS 컨센서스 ${nextEps.toFixed(2)}`,
    nextRevenue === undefined
      ? undefined
      : `매출 ${compactBriefingCurrency(nextRevenue, snapshot.earnings)}`,
  ]
    .filter((value) => value !== undefined)
    .join(" · ");
  const hasReliableVolume = technical?.volumeRatio20 !== undefined;
  const market: BriefingAgentView = {
    agent: "market",
    stance: Math.abs(change ?? 0) >= 1 ? "watch" : "neutral",
    headline:
      technical?.trend === undefined
        ? locale === "ko"
          ? "현재 가격 흐름과 직전 가격대 비교"
          : "Compare current price action with the prior price level"
        : locale === "ko"
          ? `4시간봉 ${technicalTrendLabel(locale, technical.trend)} 추세와 현재 가격 흐름 비교`
          : `Compare current price action with the ${technicalTrendLabel(locale, technical.trend)} 4h trend`,
    detail:
      locale === "ko"
        ? support !== undefined && resistance !== undefined
          ? `지지 ${support}, 저항 ${resistance}입니다. 완성 봉${hasReliableVolume ? "과 거래 강도" : ""}가 같은 방향일 때만 ${move} 움직임을 추세 신호로 봅니다.`
          : `판정 시점까지 ${priorHigh ?? current ?? "최근 관측 가격"}를 지키는지 확인합니다${hasReliableVolume ? " 거래 강도도 함께 봅니다." : "."}`
        : support !== undefined && resistance !== undefined
          ? `Support is ${support} and resistance is ${resistance}. Treat ${move} as trend evidence when the completed candle${hasReliableVolume ? " and supplied trading strength" : ""} confirms it.`
          : `Test whether price holds ${priorHigh ?? current ?? "the latest observed price"} through the stated decision window${hasReliableVolume ? " with supplied trading strength" : ""}.`,
  };
  const company: BriefingAgentView = {
    agent: "company",
    stance: companySignal === undefined ? "neutral" : "watch",
    headline:
      locale === "ko"
        ? (companySignal?.title ??
          `최근 12개월 매출 성장률 ${revenueGrowth}가 사업 기준선`)
        : (companySignal?.title ??
          `Revenue growth ${revenueGrowth} is the operating baseline`),
    detail:
      locale === "ko"
        ? "회사 또는 1차 자료에서 수요·가격·출하·계약 중 무엇이 바뀌었는지 숫자로 확인해야 사업가치에 반영할 수 있습니다."
        : "Require company or primary evidence quantifying which of demand, pricing, shipments, or contracts changed.",
  };
  const financial: BriefingAgentView = {
    agent: "financial",
    stance: "watch",
    headline:
      locale === "ko"
        ? ((companyMetric === undefined
            ? earningsLine
            : `${companyMetric} 확인`) ??
          `${nextEvent?.name ?? "다음 발표"}에서 추정치 방어 여부 확인`)
        : ((companyMetric === undefined
            ? earningsLine
            : `Track ${companyMetric}`) ??
          `Test estimates at ${nextEvent?.name ?? "the next release"}`),
    detail:
      locale === "ko"
        ? `${nextEventDate ?? "다음 공식 발표"}${estimatedEvent ? "(예상)" : ""}. 실적 발표의 핵심 확인 항목: ${financialFocus}. 회사 지표는 전년 동기 보고서의 같은 지표·기준 대비 개선·유지·약화로 판단하고, EPS는 해당 분기 컨센서스와 비교합니다.`
        : `At ${nextEventDate ?? "the next official release"}${estimatedEvent ? " (estimated)" : ""}, test ${snapshot.earnings?.nextEpsForecast === undefined ? "revenue, margin, and forward guidance" : `next-report EPS consensus ${snapshot.earnings.nextEpsForecast.toFixed(2)}`}${companyMetric === undefined ? "" : ` with ${companyMetric}`}; it is a different report and is not directly comparable with the latest result.`,
  };
  const risk: BriefingAgentView = {
    agent: "risk",
    stance: "negative",
    headline:
      locale === "ko"
        ? (riskSignal?.title ?? "하방 사건의 손익 전이 경로 점검")
        : (riskSignal?.title ??
          "Trace the downside event into operating results"),
    detail:
      locale === "ko"
        ? `회사 대응과 매출·마진·현금흐름 영향을 확인합니다${priorLow === undefined ? "." : `; ${priorLow} 이탈은 가격 경고입니다.`}`
        : `Require primary confirmation of the revenue, margin, or cash-flow effect${priorLow === undefined ? "." : `; a break below ${priorLow} is the price warning.`}`,
  };
  const evidenceViews = [
    ...(riskSignal === undefined ? [] : [risk]),
    ...(companySignal === undefined && revenueGrowth === undefined
      ? []
      : [company]),
    ...(snapshot.earnings === undefined &&
    nextEvent === undefined &&
    companyMetric === undefined
      ? []
      : [financial]),
  ];
  return [market, ...evidenceViews].slice(0, 3);
}

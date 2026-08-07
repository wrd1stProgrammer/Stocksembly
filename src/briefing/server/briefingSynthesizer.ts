import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Locale } from "../../lib/i18n";
import {
  AttemptIdSchema,
  JobIdSchema,
  RunIdSchema,
} from "../../research/domain/ids";
import {
  type CommittedLaunchReservation,
  codexInputHash,
  type LaunchReservationClaim,
  type LaunchReservationReader,
} from "../../research/server/codex/codexReservation";
import { createCodexPort } from "../../research/server/codex/codexRunner";
import type {
  BriefingAgentView,
  BriefingDecisionCheck,
  BriefingEarningsSnapshot,
  BriefingEditionPayload,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";

const AgentViewSchema = z
  .object({
    agent: z.enum(["market", "company", "financial", "risk"]),
    stance: z.enum(["positive", "negative", "watch", "neutral"]),
    headline: z.string().min(4).max(140),
    detail: z.string().min(10).max(500),
  })
  .strict();

const LocalizedSignalSchema = z
  .object({
    id: z.string().min(1).max(200),
    title: z.string().min(3).max(180),
    detail: z.string().min(8).max(650),
    investmentMeaning: z.string().min(8).max(500),
  })
  .strict();

const UpcomingEventSchema = z
  .object({
    scheduledAt: z.string().datetime(),
    name: z.string().min(2).max(160),
    whyItMatters: z.string().min(8).max(400),
    certainty: z.enum(["confirmed", "estimated"]),
  })
  .strict();

const DecisionCheckSchema = z
  .object({
    title: z.string().min(4).max(140),
    timing: z.string().min(2).max(100),
    metric: z.string().min(6).max(240),
    confirmation: z.string().min(8).max(280),
    ifConfirmed: z.string().min(8).max(280),
    ifFailed: z.string().min(8).max(280),
  })
  .strict();

const BriefingDraftSchema = z
  .object({
    headline: z.string().min(6).max(180),
    summary: z.string().min(20).max(700),
    materialChanges: z.array(LocalizedSignalSchema).max(5),
    agentViews: z.array(AgentViewSchema).min(2).max(4),
    bullCase: z.string().min(10).max(500),
    bearCase: z.string().min(10).max(500),
    upcomingEvents: z.array(UpcomingEventSchema).max(3),
    todayChecks: z.array(DecisionCheckSchema).min(2).max(3),
    changedSincePrevious: z.string().min(8).max(450).nullable(),
    stillWatching: z.string().min(8).max(350).nullable(),
  })
  .strict();

type BriefingDraft = z.infer<typeof BriefingDraftSchema>;

function normalizedTerms(value: string): ReadonlySet<string> {
  return new Set(
    value
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((term) => term.length >= 3),
  );
}

function similarity(left: string, right: string): number {
  const a = normalizedTerms(left);
  const b = normalizedTerms(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const term of a) if (b.has(term)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function novelSignals(
  snapshot: BriefingSourceSnapshot,
  previous: BriefingEditionPayload | undefined,
): readonly BriefingSignal[] {
  if (previous === undefined) return snapshot.signals;
  return snapshot.signals.filter((signal) => {
    if (signal.kind === "price") return true;
    return !previous.materialChanges.some(
      (prior) =>
        prior.id === signal.id ||
        similarity(
          `${prior.title} ${prior.detail}`,
          `${signal.title} ${signal.detail}`,
        ) >= 0.68,
    );
  });
}

function isEarningsEventName(name: string): boolean {
  return /earnings|results|실적/iu.test(name);
}

function confirmedEarningsEvent(snapshot: BriefingSourceSnapshot) {
  return snapshot.upcomingEvents.find(
    (event) =>
      event.certainty === "confirmed" && isEarningsEventName(event.name),
  );
}

function publicUpcomingEvents(snapshot: BriefingSourceSnapshot) {
  return snapshot.upcomingEvents.filter(
    (event) =>
      event.certainty === "confirmed" || !isEarningsEventName(event.name),
  );
}

function attentionFor(
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
): BriefingEditionPayload["attention"] {
  const change = Math.abs(snapshot.quote.changePercent ?? 0);
  const riskSignals = signals.filter(
    (signal) => signal.kind === "risk" || signal.direction === "negative",
  ).length;
  const imminent = snapshot.upcomingEvents.some(
    (event) =>
      Date.parse(event.scheduledAt) - Date.parse(snapshot.cutoffAt) <=
      3 * 24 * 60 * 60 * 1_000,
  );
  const outsidePreviousRange =
    snapshot.quote.value !== undefined &&
    ((snapshot.marketReference?.previousLow !== undefined &&
      snapshot.quote.value < snapshot.marketReference.previousLow) ||
      (snapshot.marketReference?.previousHigh !== undefined &&
        snapshot.quote.value > snapshot.marketReference.previousHigh));
  if (change >= 3 || riskSignals >= 2 || (signals.length >= 3 && imminent))
    return "high";
  if (change >= 1 || signals.length > 0 || imminent || outsidePreviousRange)
    return "medium";
  return "low";
}

function formatPrice(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `$${value.toFixed(2)}`;
}

function technicalTrendLabel(
  locale: Locale,
  trend: "bullish" | "bearish" | "mixed" | undefined,
): string {
  if (locale === "ko")
    return trend === "bullish" ? "상승" : trend === "bearish" ? "하락" : "혼조";
  return trend ?? "mixed";
}

function compactDate(locale: Locale, value: string): string {
  const date = new Date(value);
  if (locale === "ko")
    return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function compactCurrency(
  value: number | undefined,
  earnings: BriefingEarningsSnapshot | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: earnings?.currency ?? "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formattedFundamentalPercent(
  snapshot: BriefingSourceSnapshot,
  key: string,
): string | undefined {
  const value = snapshot.fundamentals[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function earningsRead(
  locale: Locale,
  earnings: BriefingEarningsSnapshot | undefined,
): string | undefined {
  if (earnings === undefined) return undefined;
  const actual = earnings.epsActual?.toFixed(2);
  const forecast = earnings.epsForecast?.toFixed(2);
  const surprise = earnings.epsSurprisePercent;
  const next = earnings.nextEpsForecast?.toFixed(2);
  const nextRevenue = compactCurrency(earnings.nextRevenueForecast, earnings);
  if (locale === "ko")
    return [
      actual === undefined
        ? undefined
        : forecast === undefined
          ? `최근 EPS ${actual}`
          : `최근 EPS ${actual} / 컨센서스 ${forecast}`,
      surprise === undefined
        ? undefined
        : `EPS 서프라이즈 ${surprise >= 0 ? "+" : ""}${surprise.toFixed(1)}%`,
      next === undefined ? undefined : `다음 EPS 컨센서스 ${next}`,
      nextRevenue === undefined
        ? undefined
        : `다음 매출 컨센서스 ${nextRevenue}`,
    ]
      .filter((value) => value !== undefined)
      .join(" · ");
  return [
    actual === undefined
      ? undefined
      : forecast === undefined
        ? `latest EPS ${actual}`
        : `latest EPS ${actual} vs ${forecast} consensus`,
    surprise === undefined
      ? undefined
      : `EPS surprise ${surprise >= 0 ? "+" : ""}${surprise.toFixed(1)}%`,
    next === undefined ? undefined : `next EPS consensus ${next}`,
    nextRevenue === undefined
      ? undefined
      : `next revenue consensus ${nextRevenue}`,
  ]
    .filter((value) => value !== undefined)
    .join(" · ");
}

function fallbackDecisionChecks(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
): readonly BriefingDecisionCheck[] {
  const reference = snapshot.marketReference;
  const priorHigh = formatPrice(reference?.previousHigh);
  const priorClose = formatPrice(reference?.previousClose);
  const current = formatPrice(snapshot.quote.value);
  const leadSignal = signals.find((signal) => signal.kind !== "price");
  const technical = snapshot.technicalReference;
  const fourHourSupport = formatPrice(technical?.support);
  const fourHourResistance = formatPrice(technical?.resistance);
  const fourHourRsi = technical?.rsi14?.toFixed(1);
  const nextEvent = confirmedEarningsEvent(snapshot);
  const earnings = snapshot.earnings;
  const priceCheck: BriefingDecisionCheck =
    locale === "ko"
      ? {
          title:
            leadSignal === undefined
              ? "개장 가격대가 기존 판단을 지키는가"
              : "초기 수급이 뉴스 방향을 확인하는가",
          timing: "개장 후 30분",
          metric:
            fourHourSupport !== undefined && fourHourResistance !== undefined
              ? `4시간봉 ${technicalTrendLabel(locale, technical?.trend)} 추세 · 지지 ${fourHourSupport} / 저항 ${fourHourResistance}${fourHourRsi === undefined ? "" : ` / RSI ${fourHourRsi}`}`
              : priorHigh !== undefined && priorClose !== undefined
                ? `주가 위치 · 전일 고가 ${priorHigh} / 전일 종가 ${priorClose}`
                : `주가 방향과 거래량 · 현재 확인 가격 ${current ?? "미확인"}`,
          confirmation:
            fourHourResistance !== undefined
              ? `첫 완성 4시간봉이 ${fourHourResistance} 위에서 마감하고 거래 강도가 동반되는 경우`
              : priorHigh === undefined
                ? "첫 30분 동안 뉴스 방향의 가격 흐름과 거래 증가가 함께 유지되는 경우"
                : `${priorHigh} 위에서 첫 30분을 마치고 상승 방향의 거래가 이어지는 경우`,
          ifConfirmed:
            leadSignal === undefined
              ? "기존 판단을 훼손하는 매도 압력이 없고 상단 재시험 가능성이 남습니다."
              : "헤드라인이 단순 반응을 넘어 당일 신규 수급으로 연결됐다는 근거가 강해집니다.",
          ifFailed:
            fourHourSupport !== undefined
              ? `완성 4시간봉이 ${fourHourSupport} 아래로 밀리면 단기 추세 확인은 실패한 것으로 봅니다.`
              : priorClose === undefined
                ? "가격과 거래가 엇갈리면 뉴스의 당일 영향은 낮춰서 봅니다."
                : `${priorClose} 아래로 밀리면 뉴스보다 기존 매도 압력이 강한 것으로 판단합니다.`,
        }
      : {
          title:
            leadSignal === undefined
              ? "Does the opening range preserve the current view?"
              : "Does the opening tape confirm the news direction?",
          timing: "30 minutes after the open",
          metric:
            fourHourSupport !== undefined && fourHourResistance !== undefined
              ? `4h ${technicalTrendLabel(locale, technical?.trend)} trend · support ${fourHourSupport} / resistance ${fourHourResistance}${fourHourRsi === undefined ? "" : ` / RSI ${fourHourRsi}`}`
              : priorHigh !== undefined && priorClose !== undefined
                ? `Price location · prior high ${priorHigh} / prior close ${priorClose}`
                : `Price direction and volume · latest observed ${current ?? "pending"}`,
          confirmation:
            fourHourResistance !== undefined
              ? `The first completed 4h candle closes above ${fourHourResistance} with stronger trading.`
              : priorHigh === undefined
                ? "The news-direction move and stronger trading persist through the first 30 minutes."
                : `Price holds above ${priorHigh} through the first 30 minutes with continued buying.`,
          ifConfirmed:
            "The headline has stronger evidence of attracting fresh same-day demand.",
          ifFailed:
            fourHourSupport !== undefined
              ? `A completed 4h close below ${fourHourSupport} fails the short-term trend test.`
              : priorClose === undefined
                ? "Diverging price and trading action reduce the news' same-day weight."
                : `A break below ${priorClose} shows existing selling pressure is dominating the headline.`,
        };
  const evidenceCheck: BriefingDecisionCheck =
    leadSignal === undefined && locale === "ko"
      ? {
          title: "실적 기준선에 새 변화가 생기는가",
          timing: "장중 회사 공시·컨센서스 수정",
          metric:
            earnings?.nextEpsForecast === undefined
              ? "매출 성장률·마진·가이던스의 공식 변경"
              : `다음 EPS 컨센서스 ${earnings.nextEpsForecast.toFixed(2)}와 회사 가이던스`,
          confirmation:
            "회사 공시나 신규 추정치가 매출 성장률 또는 마진 기대를 높이는 경우",
          ifConfirmed:
            "가격 움직임을 기존 범위의 소음이 아니라 실적 기대 변화로 분류합니다.",
          ifFailed:
            "공식 숫자 변화가 없으면 오늘 가격은 기존 범위 안의 수급으로만 해석합니다.",
        }
      : leadSignal === undefined
        ? {
            title: "Does the earnings baseline change?",
            timing: "Company updates or consensus revisions during the session",
            metric:
              earnings?.nextEpsForecast === undefined
                ? "An official change in revenue growth, margin, or guidance"
                : `Next EPS consensus ${earnings.nextEpsForecast.toFixed(2)} and company guidance`,
            confirmation:
              "A company update or estimate revision raises revenue growth or margin expectations.",
            ifConfirmed:
              "Treat the price move as an earnings-expectation change rather than range noise.",
            ifFailed:
              "Without an official numerical change, read today's price as flow inside the existing range.",
          }
        : locale === "ko"
          ? {
              title: "새 사건이 실적 기대를 실제로 바꾸는가",
              timing: "장중 공시·회사 후속 발표",
              metric:
                leadSignal?.title ?? "매출·마진·현금흐름에 닿는 정량 후속 근거",
              confirmation:
                "회사 또는 1차 자료에서 매출, 마진, 수주, 일정 중 하나의 정량 영향이 확인되는 경우",
              ifConfirmed:
                "새 사건을 관찰 단계에서 다음 분기 추정치 변경 후보로 올립니다.",
              ifFailed:
                "후속 숫자가 없으면 가격 반응과 사업 가치의 연결을 유보합니다.",
            }
          : {
              title: "Does the new event change operating expectations?",
              timing: "During the session or in a company follow-up",
              metric:
                leadSignal?.title ??
                "Quantified follow-through into revenue, margin, orders, or cash flow",
              confirmation:
                "A company or primary source quantifies the impact on revenue, margin, orders, or timing.",
              ifConfirmed:
                "Promote the event from watch status to a candidate estimate revision.",
              ifFailed:
                "Without a follow-up number, keep the link between the price move and operating value unproven.",
            };
  if (nextEvent === undefined) return [priceCheck, evidenceCheck];
  const eventCheck: BriefingDecisionCheck =
    locale === "ko"
      ? {
          title: "다음 실적이 현재 기대를 방어하는가",
          timing: nextEvent.scheduledAt.slice(0, 10),
          metric: `${nextEvent.name} · ${[
            earnings?.nextEpsForecast === undefined
              ? undefined
              : `EPS 컨센서스 ${earnings.nextEpsForecast.toFixed(2)}`,
            earnings?.nextRevenueForecast === undefined
              ? undefined
              : `매출 컨센서스 ${earnings.nextRevenueForecast.toLocaleString("en-US")}`,
            "마진·다음 분기 가이던스",
          ]
            .filter((value) => value !== undefined)
            .join(" / ")}`,
          confirmation:
            "핵심 성장 항목과 마진이 동시에 유지되고 다음 분기 전망이 약화되지 않는 경우",
          ifConfirmed:
            "현재 가격에 반영된 성장 지속성의 근거가 한 단계 강해집니다.",
          ifFailed:
            "성장 둔화와 마진 압박이 함께 나타나면 기대 조정 위험을 높입니다.",
        }
      : {
          title: "Does the next release defend current expectations?",
          timing: nextEvent.scheduledAt.slice(0, 10),
          metric: `${nextEvent.name} · ${[
            earnings?.nextEpsForecast === undefined
              ? undefined
              : `EPS consensus ${earnings.nextEpsForecast.toFixed(2)}`,
            earnings?.nextRevenueForecast === undefined
              ? undefined
              : `revenue consensus ${earnings.nextRevenueForecast.toLocaleString("en-US")}`,
            "margin and forward guidance",
          ]
            .filter((value) => value !== undefined)
            .join(" / ")}`,
          confirmation:
            "The key growth line and margin both hold while forward guidance avoids deterioration.",
          ifConfirmed:
            "Evidence for the growth durability embedded in the price strengthens.",
          ifFailed:
            "Simultaneous growth and margin weakness increases the risk of an expectation reset.",
        };
  return leadSignal === undefined
    ? [priceCheck, eventCheck]
    : [priceCheck, evidenceCheck, eventCheck];
}

function localizedSignalHeadline(
  locale: Locale,
  symbol: string,
  signal: BriefingSignal,
): string {
  if (locale === "en") return signal.title;
  if (signal.kind === "risk") return `${symbol}, 법률·규제 변수가 새로 포착됨`;
  if (signal.kind === "market")
    return `${symbol}, 시장 환경 변화가 상대 수급을 시험`;
  return `${symbol}, 사업 관련 새 변화가 포착됨`;
}

function localizedSignalDetail(locale: Locale, signal: BriefingSignal): string {
  if (locale === "en") return signal.detail;
  const sourceContext = `새 보도 '${signal.title}'가 포착됐습니다.`;
  if (signal.kind === "risk")
    return `${sourceContext} 회사 대응이나 비용·제품 일정 변화가 확인되기 전까지는 손익 영향보다 사건의 전이 경로를 먼저 봅니다.`;
  if (signal.kind === "market")
    return `${sourceContext} 회사 고유 수요와 분리해 동종업계 대비 가격·거래 강도가 유지되는지를 확인합니다.`;
  return `${sourceContext} 수요·가격·출하·계약 중 하나가 숫자로 확인돼야 다음 분기 추정치에 반영할 수 있습니다.`;
}

function localizedInvestmentMeaning(
  locale: Locale,
  signal: BriefingSignal,
): string {
  if (locale === "en") return signal.investmentMeaning;
  if (signal.kind === "risk")
    return "공식 대응과 비용 또는 일정 변화가 나오면 하방 범위를 다시 계산합니다.";
  if (signal.kind === "market")
    return "상대 수급이 이어질 때만 밸류에이션 프리미엄의 지속성을 높게 봅니다.";
  return "다음 매출·마진·현금흐름 중 하나로 연결될 때 사업가치 변화로 인정합니다.";
}

function fallbackDraft(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
  previous: BriefingEditionPayload | undefined,
): BriefingDraft {
  const change = snapshot.quote.changePercent;
  const move =
    change === undefined
      ? locale === "ko"
        ? "가격 확인 전"
        : "Price pending"
      : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
  const companyChanges = signals.filter((signal) => signal.kind !== "price");
  const hasChanges = companyChanges.length > 0;
  const extendedCoverage =
    Date.parse(snapshot.cutoffAt) - Date.parse(snapshot.coverageStart) >
    36 * 60 * 60 * 1_000;
  const coverageLabel =
    locale === "ko"
      ? extendedCoverage
        ? "직전 브리핑 이후"
        : "최근 24시간"
      : extendedCoverage
        ? "since the prior briefing"
        : "in the last 24 hours";
  const leadSignal = companyChanges[0];
  const earningsLine = earningsRead(locale, snapshot.earnings);
  const subject =
    leadSignal === undefined
      ? `${snapshot.symbol}: ${coverageLabel} 새 사건 없음`
      : localizedSignalHeadline(locale, snapshot.symbol, leadSignal);
  const confirmedEarnings = confirmedEarningsEvent(snapshot);
  const priorClose = formatPrice(snapshot.marketReference?.previousClose);
  const priorHigh = formatPrice(snapshot.marketReference?.previousHigh);
  const priorLow = formatPrice(snapshot.marketReference?.previousLow);
  const technical = snapshot.technicalReference;
  const fourHourSupport = formatPrice(technical?.support);
  const fourHourResistance = formatPrice(technical?.resistance);
  const fourHourRsi = technical?.rsi14?.toFixed(1);
  const headline = hasChanges
    ? locale === "ko"
      ? `${subject} — 실적 추정치에 닿는지 판정할 차례`
      : `${subject} — now test whether it reaches estimates`
    : locale === "ko"
      ? `${snapshot.symbol}, 기업 고유 새 사건 없음 — ${confirmedEarnings === undefined ? "개장 가격대가 첫 판단 기준" : `${compactDate(locale, confirmedEarnings.scheduledAt)} 실적이 다음 분기점`}`
      : `${snapshot.symbol}: no new company-specific event — ${confirmedEarnings === undefined ? "the opening range is the first decision point" : `earnings on ${compactDate(locale, confirmedEarnings.scheduledAt)} is next`}`;
  const summary = hasChanges
    ? locale === "ko"
      ? `${leadSignal === undefined ? "새 사건의 세부 내용은 확인 중입니다." : localizedSignalDetail(locale, leadSignal)} ${leadSignal === undefined ? "다음 매출·마진 수치에서 확인합니다." : localizedInvestmentMeaning(locale, leadSignal)}`
      : `${leadSignal?.detail.slice(0, 230) ?? "The new event is still being verified."} Its investment significance is ${leadSignal?.investmentMeaning ?? "tested in the next revenue and margin update."}`
    : locale === "ko"
      ? `새 공시·제품·수요 변화는 없었습니다. 현재 ${move}${priorClose === undefined ? "" : `, 전일 종가 ${priorClose}`}${priorHigh === undefined || priorLow === undefined ? "" : `와 ${priorLow}–${priorHigh} 범위`} 안에서 기존 논지가 훼손되는지만 구분합니다.`
      : `No new filing, product, or demand change appeared. At ${move}${priorClose === undefined ? "" : ` versus a ${priorClose} prior close`}, distinguish noise from a break in the existing thesis.`;
  const localizedChanges = companyChanges.slice(0, 5).map((signal) => ({
    id: signal.id,
    title: localizedSignalHeadline(locale, snapshot.symbol, signal),
    detail: localizedSignalDetail(locale, signal),
    investmentMeaning: localizedInvestmentMeaning(locale, signal),
  }));
  const companySignal = signals.find((signal) => signal.kind === "company");
  const riskSignal = companyChanges.find(
    (signal) => signal.kind === "risk" || signal.direction === "negative",
  );
  const positiveSignal = companyChanges.find(
    (signal) => signal.direction === "positive",
  );
  const nextEvent = confirmedEarningsEvent(snapshot);
  const earnings = snapshot.earnings;
  const revenueGrowth = formattedFundamentalPercent(
    snapshot,
    "revenue_one_year_growth_ttm",
  );
  const baseViews: BriefingAgentView[] = [
    {
      agent: "market",
      stance: Math.abs(change ?? 0) >= 1 ? "watch" : "neutral",
      headline:
        locale === "ko"
          ? `4시간봉 ${technicalTrendLabel(locale, technical?.trend)} 추세와 개장 흐름 비교`
          : `Compare the opening move with the ${technicalTrendLabel(locale, technical?.trend)} 4h trend`,
      detail:
        locale === "ko"
          ? fourHourSupport !== undefined && fourHourResistance !== undefined
            ? `최근 4시간봉 기준 지지 ${fourHourSupport}, 저항 ${fourHourResistance}${fourHourRsi === undefined ? "" : `, RSI ${fourHourRsi}`}입니다. 완성 봉 마감과 거래 강도가 같은 방향일 때만 ${move} 움직임을 추세 신호로 봅니다.`
            : priorHigh !== undefined && priorClose !== undefined
              ? `첫 30분 동안 전일 고가 ${priorHigh} 위를 지키는지, 실패할 경우 전일 종가 ${priorClose}까지 밀리는지를 구분합니다.`
              : "첫 30분 가격 방향과 거래 증가가 함께 유지되는지를 확인합니다."
          : fourHourSupport !== undefined && fourHourResistance !== undefined
            ? `The latest 4h structure has support at ${fourHourSupport}, resistance at ${fourHourResistance}${fourHourRsi === undefined ? "" : `, and RSI ${fourHourRsi}`}. Treat ${move} as trend evidence only when a completed candle and trading strength agree.`
            : priorHigh !== undefined && priorClose !== undefined
              ? `Separate a first-30-minute hold above ${priorHigh} from a failure back toward the ${priorClose} prior close.`
              : "Test whether price direction and stronger trading persist together through the first 30 minutes.",
    },
    {
      agent: "company",
      stance: signals.some((signal) => signal.kind === "company")
        ? "watch"
        : "neutral",
      headline:
        locale === "ko"
          ? companySignal === undefined
            ? revenueGrowth === undefined
              ? "다음 공시의 수요·가격 숫자가 사업 기준선"
              : `최근 12개월 매출 성장률 ${revenueGrowth}가 사업 기준선`
            : "수요·가격·제품 일정으로 이어지는지 확인"
          : (companySignal?.title ?? "No new operating change confirmed"),
      detail:
        locale === "ko"
          ? companySignal === undefined
            ? revenueGrowth === undefined
              ? "다음 회사 발표에서 수요·가격·출하 중 어느 항목이 기존 방향을 바꾸는지 확인합니다."
              : `다음 발표에서 매출 성장률이 ${revenueGrowth}보다 가속되는지와 마진이 함께 유지되는지를 확인합니다.`
            : "새 사건 자체보다 회사가 수주·물량·가격·납기 중 무엇을 바꿨는지 숫자로 확인해야 사업가치에 반영할 수 있습니다."
          : companySignal === undefined
            ? "After removing repeated coverage, no new event changes demand, pricing, or product timing."
            : "Require a company follow-up that quantifies which of demand, pricing, or product timing changes.",
    },
    {
      agent: "financial",
      stance: "watch",
      headline:
        locale === "ko"
          ? nextEvent === undefined
            ? (earningsLine ?? "추정치를 바꿀 공식 숫자는 아직 없음")
            : (earningsLine ?? `${nextEvent.name}에서 추정치 방어 여부 확인`)
          : nextEvent === undefined
            ? "No official number yet changes estimates"
            : `Test the estimate impact at ${nextEvent.name}`,
      detail:
        locale === "ko"
          ? nextEvent === undefined
            ? "현재 신호가 매출 성장률 또는 마진 기대를 바꾸는 정량 근거로 이어지기 전까지 재무 판단은 유지합니다."
            : `${nextEvent.scheduledAt.slice(0, 10)} 발표에서 ${earnings?.nextEpsForecast === undefined ? "EPS 컨센서스" : `EPS ${earnings.nextEpsForecast.toFixed(2)}`}${earnings?.nextRevenueForecast === undefined ? "" : `와 매출 ${compactCurrency(earnings.nextRevenueForecast, earnings)}`}를 넘기면서 마진 전망을 지키는지가 핵심입니다.`
          : nextEvent === undefined
            ? "Keep the financial view unchanged until a signal quantifies a revenue-growth or margin revision."
            : `At the ${nextEvent.scheduledAt.slice(0, 10)} release, require revenue, margin, and forward guidance to hold together.`,
    },
    {
      agent: "risk",
      stance: signals.some((signal) => signal.kind === "risk")
        ? "negative"
        : "neutral",
      headline:
        locale === "ko"
          ? riskSignal === undefined
            ? priorLow === undefined
              ? "공식 가이던스 하향이 핵심 하방 신호"
              : `전일 저가 ${priorLow}가 단기 하방 경계선`
            : "하방 사건이 손익으로 전달되는 경로를 점검"
          : (riskSignal?.title ?? "No new downside event confirmed"),
      detail:
        locale === "ko"
          ? riskSignal !== undefined
            ? `이 사건이 매출·마진·현금흐름으로 전달되는 첫 지표를 추적합니다${priorLow === undefined ? "." : `; 전일 저가 ${priorLow} 이탈은 가격 경고로 봅니다.`}`
            : priorLow === undefined
              ? "회사가 매출·마진·현금흐름 전망을 낮추는 공식 발표가 나올 때 하방 경고를 높입니다."
              : `${priorLow} 이탈과 실적 기대 하향이 겹칠 때만 단순 가격 약세를 논지 훼손으로 격상합니다.`
          : riskSignal !== undefined
            ? `Track the first line carrying this event into revenue, margin, or cash flow${priorLow === undefined ? "." : `; a break below ${priorLow} is the price warning.`}`
            : priorLow === undefined
              ? "No new downside event is present; watch only for primary evidence that damages the existing thesis."
              : `No new downside event is present; do not escalate the price warning before a break below ${priorLow}.`,
    },
  ];
  return {
    headline,
    summary,
    materialChanges: localizedChanges,
    agentViews: baseViews,
    bullCase:
      locale === "ko"
        ? `${positiveSignal?.title ?? (earnings?.nextEpsForecast === undefined ? "실적 기대 유지" : `다음 EPS 컨센서스 ${earnings.nextEpsForecast.toFixed(2)} 유지`)}가 ${priorHigh === undefined ? "개장 후 가격·거래 확인" : `${priorHigh} 위 가격 유지`}와 연결되면 상방 논리가 강화됩니다.`
        : `${positiveSignal?.title ?? "The current positive signal"} strengthens the upside case if it connects to ${priorHigh === undefined ? "post-open price and trading confirmation" : `a hold above ${priorHigh}`} and better forward estimates.`,
    bearCase:
      locale === "ko"
        ? `${riskSignal?.title ?? (earnings?.nextEpsForecast === undefined ? "실적 기대 하향" : `다음 EPS 컨센서스 ${earnings.nextEpsForecast.toFixed(2)} 하향`)}이 ${priorLow === undefined ? "매출·마진 약화" : `${priorLow} 이탈`}과 겹치면 하방 부담을 높입니다.`
        : `${riskSignal?.title ?? "Missing operating follow-through"} raises downside risk if it coincides with ${priorLow === undefined ? "weaker revenue or margins" : `a break below ${priorLow}`}.`,
    upcomingEvents: publicUpcomingEvents(snapshot).map((event) => ({
      ...event,
      whyItMatters:
        locale === "ko" && isEarningsEventName(event.name)
          ? `${earnings?.nextEpsForecast === undefined ? "매출·마진" : `EPS ${earnings.nextEpsForecast.toFixed(2)} 컨센서스와 마진`}을 지키는지가 다음 추정치의 기준입니다.`
          : event.whyItMatters,
      certainty: event.certainty ?? "estimated",
    })),
    todayChecks: [...fallbackDecisionChecks(locale, snapshot, signals)],
    changedSincePrevious:
      previous === undefined
        ? null
        : hasChanges
          ? locale === "ko"
            ? `전일 브리핑에 없던 새 신호 ${companyChanges.length}건을 반영했습니다.`
            : `${companyChanges.length} signal${companyChanges.length === 1 ? " is" : "s are"} new versus the prior briefing.`
          : null,
    stillWatching: null,
  };
}

function repairInternalRepetition(
  draft: BriefingDraft,
  fallback: BriefingDraft,
): BriefingDraft {
  const hasInternalEvidenceLanguage = (value: string) =>
    /(?:공급|제공)된\s*(?:(?:\S+)\s+){0,3}(?:관측|자료|데이터|증거|뉴스|신호|시계열|창)|(?:자료|데이터|시계열)(?:가|이|도)?\s*(?:제공되지|없)|supplied\s+(?:window|evidence|data|signals?)|provided\s+(?:data|evidence|signals?)|provider data/iu.test(
      value,
    );
  const headline = hasInternalEvidenceLanguage(draft.headline)
    ? fallback.headline
    : draft.headline;
  const summary =
    hasInternalEvidenceLanguage(draft.summary) ||
    similarity(headline, draft.summary) >= 0.52
      ? fallback.summary
      : draft.summary;
  const used: string[] = [headline, summary];
  const agentViews = draft.agentViews.map((view) => {
    const combined = `${view.headline} ${view.detail}`;
    const overlaps = used.some(
      (section) => similarity(section, combined) >= 0.66,
    );
    const repaired =
      overlaps || hasInternalEvidenceLanguage(combined)
        ? (fallback.agentViews.find(
            (candidate) => candidate.agent === view.agent,
          ) ?? view)
        : view;
    used.push(`${repaired.headline} ${repaired.detail}`);
    return repaired;
  });
  const bullCase =
    similarity(draft.bullCase, draft.bearCase) >= 0.58
      ? fallback.bullCase
      : draft.bullCase;
  const bearCase =
    similarity(bullCase, draft.bearCase) >= 0.58
      ? fallback.bearCase
      : draft.bearCase;
  return {
    ...draft,
    headline,
    summary,
    agentViews,
    bullCase,
    bearCase,
  };
}

function localizeTechnicalVocabulary(
  locale: Locale,
  draft: BriefingDraft,
  symbol: string,
): BriefingDraft {
  if (locale !== "ko") return draft;
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = (value: string) =>
    value
      .replace(/\bbullish\b/giu, "상승")
      .replace(/\bbearish\b/giu, "하락")
      .replace(/\bmixed\b/giu, "혼조")
      .replace(/\bneutral\b/giu, "중립")
      .replace(
        new RegExp(`${escapedSymbol}\\s+earnings`, "giu"),
        `${symbol} 실적 발표`,
      )
      .replace(/이번 관측 창(?:에는|에서)/gu, "직전 브리핑 이후")
      .replace(/관측 창 내/gu, "직전 브리핑 이후")
      .replace(/제공되지 않았/gu, "확인되지 않았")
      .replace(/제공되지 않은/gu, "확인되지 않은");
  return {
    ...draft,
    headline: text(draft.headline),
    summary: text(draft.summary),
    materialChanges: draft.materialChanges.map((change) => ({
      ...change,
      title: text(change.title),
      detail: text(change.detail),
      investmentMeaning: text(change.investmentMeaning),
    })),
    agentViews: draft.agentViews.map((view) => ({
      ...view,
      headline: text(view.headline),
      detail: text(view.detail),
    })),
    bullCase: text(draft.bullCase),
    bearCase: text(draft.bearCase),
    upcomingEvents: draft.upcomingEvents.map((event) => ({
      ...event,
      name: text(event.name),
      whyItMatters: text(event.whyItMatters),
    })),
    todayChecks: draft.todayChecks.map((check) => ({
      ...check,
      title: text(check.title),
      timing: text(check.timing),
      metric: text(check.metric),
      confirmation: text(check.confirmation),
      ifConfirmed: text(check.ifConfirmed),
      ifFailed: text(check.ifFailed),
    })),
    changedSincePrevious:
      draft.changedSincePrevious === null
        ? null
        : text(draft.changedSincePrevious),
    stillWatching:
      draft.stillWatching === null ? null : text(draft.stillWatching),
  };
}

function promptFor(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
  previous: BriefingEditionPayload | undefined,
): string {
  const coverageHours = Math.round(
    (Date.parse(snapshot.cutoffAt) - Date.parse(snapshot.coverageStart)) /
      (60 * 60 * 1_000),
  );
  const promptSnapshot = {
    ...snapshot,
    upcomingEvents: publicUpcomingEvents(snapshot),
    quote: {
      ...snapshot.quote,
      ...(snapshot.quote.value === undefined
        ? {}
        : { value: Number(snapshot.quote.value.toFixed(2)) }),
      ...(snapshot.quote.changePercent === undefined
        ? {}
        : {
            changePercent: Number(snapshot.quote.changePercent.toFixed(2)),
          }),
    },
    ...(snapshot.marketReference === undefined
      ? {}
      : {
          marketReference: Object.fromEntries(
            Object.entries(snapshot.marketReference).map(([key, value]) => [
              key,
              typeof value !== "number"
                ? value
                : key === "averageVolume20d"
                  ? Math.round(value)
                  : Number(value.toFixed(2)),
            ]),
          ),
        }),
    ...(snapshot.technicalReference === undefined
      ? {}
      : {
          technicalReference: Object.fromEntries(
            Object.entries(snapshot.technicalReference).map(([key, value]) => [
              key,
              typeof value !== "number" ? value : Number(value.toFixed(2)),
            ]),
          ),
        }),
    fundamentals: Object.fromEntries(
      Object.entries(snapshot.fundamentals).map(([key, value]) => [
        key,
        typeof value !== "number"
          ? value
          : Math.abs(value) >= 1_000
            ? Math.round(value)
            : Number(value.toFixed(2)),
      ]),
    ),
    fundamentalSeries: Object.fromEntries(
      Object.entries(snapshot.fundamentalSeries ?? {}).map(([key, points]) => [
        key,
        points.map((point) => ({
          observedAt: point.observedAt,
          value:
            Math.abs(point.value) >= 1_000
              ? Math.round(point.value)
              : Number(point.value.toFixed(2)),
        })),
      ]),
    ),
    ...(snapshot.earnings === undefined
      ? {}
      : {
          earnings: Object.fromEntries(
            Object.entries(snapshot.earnings).map(([key, value]) => [
              key,
              typeof value !== "number"
                ? value
                : Math.abs(value) >= 1_000
                  ? Math.round(value)
                  : Number(value.toFixed(2)),
            ]),
          ),
        }),
    signals,
  };
  return [
    "You are the chair of a four-agent US equity pre-market briefing.",
    `Write the entire response in ${locale === "ko" ? "natural Korean" : "concise professional English"}.`,
    "Use only the JSON evidence below. Do not browse. Do not invent facts, dates, prices, estimates, or events.",
    "This is a briefing, not a research report: prioritize what changed inside the supplied evidence window, what is scheduled next, and exactly what to verify today.",
    "The output language is not an investor geography. Korean output must still use a global/US-equity frame; never default to Korean retail flows, Korean leveraged products, or Korea-specific positioning because locale=ko.",
    "Mention a country only when the supplied event changes the issuer's revenue, demand, costs, regulation, production, or competitive position. Regional investor-flow stories are not company signals.",
    `The evidence window spans about ${coverageHours} hours. If it is longer than 36 hours, call it a weekend/holiday catch-up or 'since the prior briefing'—never 'the last 24 hours'.`,
    "Do not repeat the same meaning across headline, summary, cases, agent views, and checks.",
    "Give each surface one job: headline=decision-changing development; summary=new facts and investment consequence; agent views=four non-overlapping lenses; cases=asymmetric paths; checks=observable pass/fail rules. Do not restate the headline or price move in the summary.",
    "Avoid generic balance, canned risk disclaimers, empty neutrality, and phrases about unavailable provider data.",
    "Be directionally clear but conditional. Never issue a buy/sell recommendation or target price.",
    "Each agent owns a distinct lens: market=price/volume/relative tape, company=demand/product/competition, financial=estimate/margin/cash-flow implication, risk=downside transmission.",
    "Every agent view must name a supplied event, price level, market reference, fundamental, or dated earnings event. Do not use reusable advice such as merely 'check volume' or 'watch estimates'.",
    "When snapshot.earnings is present, the financial view and at least one decision check must use its actual, consensus, surprise, or next-quarter forecast numbers instead of generic earnings language.",
    "Use fundamentalSeries to distinguish an improving, weakening, or flat multi-quarter operating trend. Do not call a one-period move a trend.",
    "When marketReference.premarketGapPercent is present, distinguish the pre-market gap from the regular-session change and test it against the prior close/high/low after the open.",
    "Use technicalReference as the primary technical lens. It contains up to 390 four-hour candles; cite its trend, RSI, support, resistance, or moving averages only when they change the decision rule. Never turn an indicator into a price forecast.",
    "materialChanges must use only the supplied signal IDs. Omit a signal if it repeats the previous briefing without a material change.",
    "upcomingEvents must preserve supplied ISO dates and certainty values exactly.",
    "An estimated earnings date is intentionally absent from snapshot.upcomingEvents. Never recover or mention it from snapshot.earnings.nextReportAt; say the date is unconfirmed instead.",
    "todayChecks are executable decision rules, not reminders. Each check must state when to look, the exact supplied metric or named evidence to observe, a pass condition, and distinct investment implications for passing versus failing.",
    "Use supplied quote and marketReference numbers for price thresholds. If no relevant number exists, use a named observable condition or dated event and do not invent a threshold.",
    "On quiet-news days, do not pad the briefing. Use the prior close/high/low, the next earnings date, and the single most decision-relevant unresolved proof point.",
    "Prefer primary/company evidence over commentary. A secondary-source headline must remain explicitly conditional until primary evidence confirms it.",
    "Set changedSincePrevious or stillWatching to null when that field is not applicable. Do not omit schema fields.",
    "Display prices and percentages with at most two decimals. Do not recite the cutoff timestamp unless its time is decision-relevant.",
    JSON.stringify(
      {
        snapshot: promptSnapshot,
        previous:
          previous === undefined
            ? null
            : {
                headline: previous.headline,
                summary: previous.summary,
                materialChanges: previous.materialChanges.map((signal) => ({
                  id: signal.id,
                  title: signal.title,
                  detail: signal.detail,
                })),
                agentViews: previous.agentViews,
                todayChecks: previous.todayChecks,
                bullCase: previous.bullCase,
                bearCase: previous.bearCase,
                attention: previous.attention,
              },
      },
      null,
      2,
    ),
  ].join("\n\n");
}

async function generateDraft(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  signals: readonly BriefingSignal[],
  previous: BriefingEditionPayload | undefined,
): Promise<BriefingDraft> {
  const prompt = promptFor(locale, snapshot, signals, previous);
  const key = {
    runId: RunIdSchema.parse(randomUUID()),
    jobId: JobIdSchema.parse(randomUUID()),
    attemptId: AttemptIdSchema.parse(randomUUID()),
    ordinal: 1,
  };
  const fence = { ownerId: `briefing:${process.pid}`, token: 1 };
  const claim: LaunchReservationClaim = { key, fence };
  const inputHash = codexInputHash({
    stage: "department_consolidation",
    prompt,
    outputSchema: BriefingDraftSchema,
  });
  const committed: CommittedLaunchReservation = {
    ...key,
    status: "spawn_reserved",
    committed: true,
    inputHash,
    reservationFence: fence,
    currentFence: fence,
  };
  const reservations: LaunchReservationReader = {
    readCommittedReservation: async (candidate) =>
      candidate.runId === key.runId &&
      candidate.jobId === key.jobId &&
      candidate.attemptId === key.attemptId &&
      candidate.ordinal === key.ordinal
        ? committed
        : undefined,
  };
  const attemptDir = await mkdtemp(
    join(await realpath(tmpdir()), "stocksembly-briefing-"),
  );
  try {
    const result = await createCodexPort(reservations).run({
      attemptDir,
      reservation: claim,
      stage: "department_consolidation",
      prompt,
      outputSchema: BriefingDraftSchema,
    });
    return result.candidate;
  } finally {
    await rm(attemptDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

export async function synthesizeBriefingEdition(input: {
  readonly locale: Locale;
  readonly snapshot: BriefingSourceSnapshot;
  readonly previous?: BriefingEditionPayload;
  readonly generatedAt: string;
}): Promise<BriefingEditionPayload> {
  const signals = novelSignals(input.snapshot, input.previous);
  const fallback = fallbackDraft(
    input.locale,
    input.snapshot,
    signals,
    input.previous,
  );
  let draft: BriefingDraft;
  let modelFailed = false;
  try {
    draft = await generateDraft(
      input.locale,
      input.snapshot,
      signals,
      input.previous,
    );
  } catch (error) {
    modelFailed = true;
    // biome-ignore lint/complexity/useLiteralKeys: worker env typing uses an index signature.
    if (process.env["NODE_ENV"] !== "production")
      console.error("BRIEFING_SYNTHESIS_FALLBACK", error);
    draft = fallback;
  }
  draft = localizeTechnicalVocabulary(
    input.locale,
    repairInternalRepetition(draft, fallback),
    input.snapshot.symbol,
  );
  const byId = new Map(signals.map((signal) => [signal.id, signal]));
  const materialChanges = draft.materialChanges.flatMap((localized) => {
    const source = byId.get(localized.id);
    return source === undefined || source.kind === "price"
      ? []
      : [
          {
            ...source,
            title: localized.title,
            detail: localized.detail,
            investmentMeaning: localized.investmentMeaning,
          },
        ];
  });
  const materialSourceUrls = new Set(
    materialChanges.flatMap((signal) =>
      signal.sourceUrl === undefined ? [] : [signal.sourceUrl],
    ),
  );
  const citedSources = input.snapshot.sources.filter((source) =>
    materialSourceUrls.has(source.url),
  );
  const upcomingEvents = publicUpcomingEvents(input.snapshot)
    .slice(0, 3)
    .map((source) => {
      const localized = draft.upcomingEvents.find(
        (event) => event.scheduledAt === source.scheduledAt,
      );
      const fallbackLocalized = fallback.upcomingEvents.find(
        (event) => event.scheduledAt === source.scheduledAt,
      );
      const koreanEarnings =
        input.locale === "ko" && isEarningsEventName(source.name);
      return Object.freeze({
        ...source,
        ...(localized === undefined && fallbackLocalized === undefined
          ? {}
          : {
              name: koreanEarnings
                ? `${input.snapshot.symbol} 실적 발표`
                : (localized?.name ?? fallbackLocalized?.name ?? source.name),
              whyItMatters:
                koreanEarnings && fallbackLocalized !== undefined
                  ? fallbackLocalized.whyItMatters
                  : (localized?.whyItMatters ??
                    fallbackLocalized?.whyItMatters ??
                    source.whyItMatters),
            }),
        certainty: source.certainty ?? "estimated",
      });
    });
  return Object.freeze({
    schemaVersion: 1,
    symbol: input.snapshot.symbol,
    company: input.snapshot.company,
    locale: input.locale,
    marketDate: input.snapshot.marketDate,
    generatedAt: input.generatedAt,
    cutoffAt: input.snapshot.cutoffAt,
    coverageStart: input.snapshot.coverageStart,
    status:
      modelFailed || input.snapshot.limitations.length > 0
        ? "partial"
        : "ready",
    attention: attentionFor(input.snapshot, signals),
    headline: draft.headline,
    summary: draft.summary,
    price: input.snapshot.quote,
    ...(input.snapshot.earnings === undefined
      ? {}
      : { earnings: input.snapshot.earnings }),
    materialChanges: Object.freeze(materialChanges),
    agentViews: Object.freeze(draft.agentViews),
    bullCase: draft.bullCase,
    bearCase: draft.bearCase,
    upcomingEvents: Object.freeze(upcomingEvents),
    todayChecks: Object.freeze(draft.todayChecks),
    ...(draft.changedSincePrevious === null
      ? {}
      : { changedSincePrevious: draft.changedSincePrevious }),
    ...(draft.stillWatching === null
      ? {}
      : { stillWatching: draft.stillWatching }),
    sources: Object.freeze(citedSources),
    limitations: input.snapshot.limitations,
  });
}

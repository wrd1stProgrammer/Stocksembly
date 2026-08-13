import type { Locale } from "../../lib/i18n";
import type {
  BriefingEarningsSnapshot,
  BriefingSignal,
  BriefingSourceSnapshot,
} from "../domain/contracts";
import {
  type CompanyEvidenceTerm,
  companyEvidenceTerms,
} from "./briefingCompanyEvidence";

export function formatBriefingPrice(
  value: number | undefined,
): string | undefined {
  return value === undefined ? undefined : `$${value.toFixed(2)}`;
}

export function technicalTrendLabel(
  locale: Locale,
  trend: "bullish" | "bearish" | "mixed" | undefined,
): string {
  if (locale === "ko")
    return trend === "bullish" ? "상승" : trend === "bearish" ? "하락" : "혼조";
  return trend ?? "mixed";
}

export function compactBriefingDate(locale: Locale, value: string): string {
  const date = new Date(value);
  if (locale === "ko")
    return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function compactBriefingCurrency(
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

export function formattedFundamentalPercent(
  snapshot: BriefingSourceSnapshot,
  key: string,
): string | undefined {
  const value = snapshot.fundamentals[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

export function earningsRead(
  locale: Locale,
  earnings: BriefingEarningsSnapshot | undefined,
): string | undefined {
  if (earnings === undefined) return undefined;
  const actual = earnings.epsActual?.toFixed(2);
  const forecast = earnings.epsForecast?.toFixed(2);
  const surprise = earnings.epsSurprisePercent;
  const values =
    locale === "ko"
      ? [
          actual === undefined
            ? undefined
            : forecast === undefined
              ? `최근 EPS ${actual}`
              : `최근 EPS ${actual} / 컨센서스 ${forecast}`,
          surprise === undefined
            ? undefined
            : `EPS 서프라이즈 ${surprise >= 0 ? "+" : ""}${surprise.toFixed(1)}%`,
        ]
      : [
          actual === undefined
            ? undefined
            : forecast === undefined
              ? `latest EPS ${actual}`
              : `latest EPS ${actual} vs ${forecast} consensus`,
          surprise === undefined
            ? undefined
            : `EPS surprise ${surprise >= 0 ? "+" : ""}${surprise.toFixed(1)}%`,
        ];
  return values.filter((value) => value !== undefined).join(" · ");
}

const KOREAN_COMPANY_FINANCIAL_PHRASES: Readonly<
  Record<CompanyEvidenceTerm, string>
> = {
  CET1: "보통주자본비율(CET1)",
  ROTCE: "유형보통주자본이익률(ROTCE)",
  "net charge-offs": "순대손상각",
  "net interest income": "순이자이익",
  NII: "순이자이익(NII)",
  "credit costs": "신용비용",
  provision: "대손충당금 전입액",
  Blackwell: "Blackwell",
  "data center": "데이터센터",
  networking: "네트워킹",
  Azure: "Azure",
  "intelligent cloud": "인텔리전트 클라우드",
  AWS: "AWS",
  Services: "서비스",
  iPhone: "iPhone",
  deliveries: "인도량",
  "automotive gross margin": "자동차 매출총이익률",
  "energy storage": "에너지 저장장치",
  advertising: "광고",
  fulfillment: "풀필먼트",
  "product mix": "제품 믹스",
  capex: "설비투자",
  supply: "공급",
  cloud: "클라우드",
  "operating margin": "영업이익률",
  "gross margin": "매출총이익률",
};

export function companyFinancialPhrases(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
): readonly string[] {
  const evidence =
    snapshot.backgroundFinancialContext?.documents
      .map((document) => document.excerpt)
      .join(" ") ?? "";
  return companyEvidenceTerms(evidence, snapshot.symbol).map((term) =>
    locale === "ko" ? KOREAN_COMPANY_FINANCIAL_PHRASES[term] : term,
  );
}

export function companyFinancialPhrase(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
): string | undefined {
  return companyFinancialPhrases(locale, snapshot)[0];
}

export function earningsEventWhyItMatters(
  locale: Locale,
  snapshot: BriefingSourceSnapshot,
  fallback: string,
): string {
  const focus = companyFinancialPhrases(locale, snapshot).join(" · ");
  const nextEps = snapshot.earnings?.nextEpsForecast;
  if (focus.length === 0 && nextEps === undefined) {
    return locale === "ko"
      ? "매출·마진과 다음 분기 가이던스를 지키는지가 추정치의 기준입니다."
      : fallback;
  }
  const threshold =
    nextEps === undefined
      ? ""
      : locale === "ko"
        ? `다음 보고서 EPS 컨센서스 ${nextEps.toFixed(2)}`
        : `next-report EPS consensus ${nextEps.toFixed(2)}`;
  const evidence = [focus, threshold]
    .filter((value) => value.length > 0)
    .join(locale === "ko" ? " · " : " and ");
  return locale === "ko"
    ? `실적 발표의 핵심 확인 항목: ${evidence}. 회사 지표는 전년 동기 보고서의 같은 지표·기준 대비 개선·유지·약화로 판단하고, EPS는 해당 분기 컨센서스와 비교합니다.`
    : `Earnings focus: ${evidence}. Judge company metrics as improved, held, or weakened against the same metric and basis in the comparable year-ago report; judge EPS only against the consensus for this report.`;
}

export function localizedSignalHeadline(
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

export function localizedSignalDetail(
  locale: Locale,
  signal: BriefingSignal,
): string {
  if (locale === "en") return signal.detail;
  const sourceContext = `새 보도 '${signal.title}'가 포착됐습니다.`;
  if (signal.kind === "risk")
    return `${sourceContext} 회사 대응이나 비용·제품 일정 변화가 확인되기 전까지는 손익 영향보다 사건의 전이 경로를 먼저 봅니다.`;
  if (signal.kind === "market")
    return `${sourceContext} 회사 고유 수요와 분리해 동종업계 대비 가격·거래 강도가 유지되는지를 확인합니다.`;
  return `${sourceContext} 수요·가격·출하·계약 중 하나가 숫자로 확인돼야 다음 분기 추정치에 반영할 수 있습니다.`;
}

export function localizedInvestmentMeaning(
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

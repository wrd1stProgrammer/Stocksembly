import "../../styles/research-team-help.css";
import type { Locale } from "../../lib/i18n";
import type { ResearchTarget } from "../../research/domain/researchTarget";

const coverage = {
  committee: {
    ko: "시장·기업·재무·리스크 분석을 종합합니다. 캔들 데이터가 제공되면 여러 시간대의 기술적 차트도 포함합니다.",
    en: "Combines market, business, financial and risk research, including multi-timeframe technical charts when candle data is available.",
  },
  market: {
    ko: "가격 추세·지지와 저항·시장 환경을 분석합니다. 캔들 데이터가 제공되면 기술적 차트와 조건별 시나리오를 포함합니다.",
    en: "Studies price trends, support and resistance, and market conditions. Includes technical charts and conditional scenarios when candle data is available.",
  },
  company: {
    ko: "사업 모델·제품·경쟁사·성장 동력을 분석합니다. 기술적 캔들 차트는 시장팀 또는 전체 에이전트 리서치에서 확인하세요.",
    en: "Studies the business model, products, competitors and growth drivers. Choose market or full-team research for technical candle charts.",
  },
  financial: {
    ko: "실적·현금흐름·재무 건전성·가치평가를 분석합니다. 재무 지표 시각화와 기술적 캔들 차트는 서로 다른 분석입니다.",
    en: "Studies earnings, cash flow, financial health and valuation. Financial visualizations are distinct from technical candle charts.",
  },
  risk: {
    ko: "하방 위험·정책·반대 근거·시나리오를 분석합니다. 기술적 캔들 차트는 시장팀 또는 전체 에이전트 리서치에서 확인하세요.",
    en: "Studies downside risks, policy, counterarguments and scenarios. Choose market or full-team research for technical candle charts.",
  },
};
export function TeamCoverageHelp({
  target,
  locale,
}: {
  target?: ResearchTarget | undefined;
  locale: Locale;
}) {
  const key = target?.kind === "department" ? target.departmentId : "committee";
  return (
    <details className="research-team-help">
      <summary>
        <span aria-hidden="true">?</span>{" "}
        {locale === "ko"
          ? "이 리서치에 포함되는 내용"
          : "What this research covers"}
      </summary>
      <p>{coverage[key][locale]}</p>
    </details>
  );
}

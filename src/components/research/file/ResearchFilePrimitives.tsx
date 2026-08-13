import type { ReactNode } from "react";
import type { Locale } from "../../../lib/i18n";
import type { ResearchEvidenceStrength } from "../../../research/compositions/types";
import type { EditorialCallout } from "../../../research/researchFileEditorialModel";

export type ResearchTermKey =
  | "teamConfidence"
  | "evidenceReliability"
  | "regimeTiming"
  | "decisionLens"
  | "signalPersistence"
  | "datedCatalyst"
  | "embeddedExpectations"
  | "relativeValuation"
  | "segmentMix"
  | "adoptionProof"
  | "impactObservability"
  | "financialTransmission"
  | "leadingIndicator"
  | "financialLab"
  | "riskRegister";

type SectionHeaderProps = {
  readonly number: "01" | "02" | "03" | "04" | "∆" | "Q";
  readonly title: string;
  readonly description: string;
  readonly help?: {
    readonly term: ResearchTermKey;
    readonly locale: Locale;
  };
};

const researchTermHelp: Readonly<
  Record<ResearchTermKey, Readonly<Record<Locale, string>>>
> = {
  teamConfidence: {
    ko: "팀의 결론 방향과 주장 강도를 종합한 값입니다. 근거 품질과는 별도로 읽습니다.",
    en: "A combined reading of the team's directional conviction and claim strength; read it separately from evidence quality.",
  },
  evidenceReliability: {
    ko: "이 팀이 사용한 주장별 근거의 연결률·강도·최신성을 종합한 값입니다.",
    en: "A team-scoped measure combining claim-level evidence coverage, strength, and freshness.",
  },
  regimeTiming: {
    ko: "가격·수급·상대 성과가 현재 어떤 시장 환경과 진입 구간을 가리키는지 함께 판단합니다.",
    en: "Reads price, flow, and relative performance together to locate the current market regime and entry window.",
  },
  decisionLens: {
    ko: "시장팀 결론을 만든 서로 다른 관찰 축입니다. 같은 내용을 반복하는 요약 점수가 아닙니다.",
    en: "Distinct observation axes behind the market team's call, rather than repeated summary scores.",
  },
  signalPersistence: {
    ko: "기간별 상대 성과의 방향이 이어지는지 비교해 단기 움직임이 추세인지 일시적 반응인지 구분합니다.",
    en: "Compares relative performance across horizons to distinguish a durable trend from a short-lived move.",
  },
  datedCatalyst: {
    ko: "날짜가 확인된 실적·공시·행사 중 현재 판단을 바꿀 수 있는 일정입니다.",
    en: "Dated earnings, filings, or events capable of changing the current call.",
  },
  embeddedExpectations: {
    ko: "현재 가격과 시장 추정치에 이미 반영된 성장·이익 기대를 뜻합니다.",
    en: "Growth and earnings assumptions already embedded in the price and market estimates.",
  },
  relativeValuation: {
    ko: "같은 기간과 정의로 비교 가능한 기업들의 배수를 기준으로 대상 기업의 프리미엄·할인을 봅니다.",
    en: "Compares the subject's multiple with qualified peers using aligned periods and definitions.",
  },
  segmentMix: {
    ko: "전체 사업에서 각 제품·서비스 부문이 차지하는 비중입니다.",
    en: "The share of total business represented by each product or service segment.",
  },
  adoptionProof: {
    ko: "제품 사용·고객 확산·반복 이용이 실제 수치로 확인되는지를 뜻합니다.",
    en: "Evidence that product use, customer expansion, or repeat activity is visible in observed metrics.",
  },
  impactObservability: {
    ko: "위험이 손익에 미칠 영향과 실제 데이터로 조기에 포착할 수 있는 정도를 함께 비교합니다.",
    en: "Compares financial impact with how early and reliably the risk can be observed in data.",
  },
  financialTransmission: {
    ko: "위험이 매출·마진·현금흐름으로 번지는 경로를 확인하는 지표입니다.",
    en: "Metrics that show how a risk transmits into revenue, margins, and cash flow.",
  },
  leadingIndicator: {
    ko: "실적 악화가 확정되기 전에 위험 방향을 먼저 보여주는 관찰 지표입니다.",
    en: "An observable signal that can reveal risk direction before reported results confirm it.",
  },
  financialLab: {
    ko: "매출이 이익과 잉여현금으로 얼마나 전환되는지, 투자 부담과 현재 밸류에이션이 요구하는 실행 수준을 함께 검증합니다.",
    en: "Tests how revenue converts into earnings and free cash flow, alongside reinvestment burden and the execution implied by valuation.",
  },
  riskRegister: {
    ko: "발생 가능성을 임의로 예측하지 않고, 손익 영향과 데이터로 조기에 관찰할 수 있는 정도를 기준으로 위험을 정렬합니다.",
    en: "Ranks risks by financial impact and how early they can be observed in data, without inventing occurrence probabilities.",
  },
};

const strengthLabels = {
  strong: { en: "Strong evidence", ko: "강한 근거" },
  moderate: { en: "Moderate evidence", ko: "보통 근거" },
  limited: { en: "Limited evidence", ko: "제한적 근거" },
  contested: { en: "Contested", ko: "상충 근거" },
  unverified: { en: "Not yet verified", ko: "근거 미확인" },
} as const;

export function ResearchFileSectionHeader({
  number,
  title,
  description,
  help,
}: SectionHeaderProps) {
  return (
    <header className="research-editorial-heading">
      <span aria-hidden="true">{number}</span>
      <div>
        <h2 aria-label={title}>
          {help === undefined ? (
            title
          ) : (
            <ResearchTermHelp
              term={help.term}
              label={title}
              locale={help.locale}
            />
          )}
        </h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

export function EvidenceStrength({
  strength,
  locale,
}: {
  readonly strength: ResearchEvidenceStrength;
  readonly locale: Locale;
}) {
  return (
    <span className="research-evidence-strength" data-strength={strength}>
      {strengthLabels[strength][locale]}
    </span>
  );
}

export function ResearchTermHelp({
  term,
  label,
  locale,
}: {
  readonly term: ResearchTermKey;
  readonly label: ReactNode;
  readonly locale: Locale;
}) {
  return (
    <ResearchInlineHelp
      label={label}
      description={researchTermHelp[term][locale]}
      locale={locale}
    />
  );
}

export function ResearchInlineHelp({
  label,
  description,
  locale,
}: {
  readonly label: ReactNode;
  readonly description: string;
  readonly locale: Locale;
}) {
  return (
    <span className="research-term-help">
      <span>{label}</span>
      <button
        type="button"
        aria-label={
          locale === "ko"
            ? `${String(label)} 설명`
            : `${String(label)} explanation`
        }
      >
        ?
      </button>
      <small role="tooltip">{description}</small>
    </span>
  );
}

export function EditorialList({
  items,
}: {
  readonly items: readonly EditorialCallout[];
}) {
  return (
    <ol className="research-editorial-list">
      {items.map((item, index) => (
        <li key={`${item.headline}-${item.body}`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>{item.headline}</strong>
            <p>{item.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EditorialCell({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="research-editorial-cell">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

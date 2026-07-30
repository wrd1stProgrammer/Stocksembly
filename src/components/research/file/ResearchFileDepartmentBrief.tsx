import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { WorkflowDepartmentId } from "../../../research/domain/roleRegistry";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { ResearchFileSectionHeader } from "./ResearchFilePrimitives";
import {
  ResearchDecisionPathBoard,
  ResearchEvidenceBalance,
  ResearchMetricStrip,
  ResearchSegmentMix,
} from "./ResearchFileVisuals";

type Props = {
  readonly departmentId: WorkflowDepartmentId;
  readonly file: ResearchFileData;
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
};

type DepartmentCopy = {
  readonly primaryTitle: string;
  readonly primaryDescription: string;
  readonly secondaryTitle: string;
  readonly secondaryDescription: string;
};

const COPY: Readonly<
  Record<
    WorkflowDepartmentId,
    { readonly en: DepartmentCopy; readonly ko: DepartmentCopy }
  >
> = {
  market: {
    en: {
      primaryTitle: "Market timing map",
      primaryDescription:
        "Read the current regime, tradable signals, and the conditions that confirm or invalidate timing.",
      secondaryTitle: "Confirmation zones & catalyst clock",
      secondaryDescription:
        "Separate a usable entry signal from short-lived noise, then anchor the view to the next observable event.",
    },
    ko: {
      primaryTitle: "시장 타이밍 맵",
      primaryDescription:
        "현재 시장 국면과 가격 신호를 읽고, 타이밍을 확인하거나 무효화할 조건을 구분합니다.",
      secondaryTitle: "확인 구간·촉매 시계",
      secondaryDescription:
        "실행 가능한 진입 신호와 단기 노이즈를 구분하고 다음 관찰 이벤트에 판단을 연결합니다.",
    },
  },
  company: {
    en: {
      primaryTitle: "Growth engine map",
      primaryDescription:
        "Break the business into growth engines, moat layers, and execution dependencies instead of treating the company as one story.",
      secondaryTitle: "Execution milestones & moat tests",
      secondaryDescription:
        "Track what must compound, what can erode, and the operating proof that should arrive next.",
    },
    ko: {
      primaryTitle: "성장 엔진 맵",
      primaryDescription:
        "회사를 하나의 이야기로 보지 않고 성장 엔진·경쟁우위 층·실행 의존성으로 분해합니다.",
      secondaryTitle: "실행 마일스톤·해자 검증",
      secondaryDescription:
        "무엇이 누적 성장해야 하고 무엇이 경쟁우위를 훼손하는지 다음 운영 근거와 함께 확인합니다.",
    },
  },
  financial: {
    en: {
      primaryTitle: "Earnings & valuation lab",
      primaryDescription:
        "Trace growth through margin and cash conversion, then test how much operating perfection the observed price requires.",
      secondaryTitle: "Embedded expectations & safety margin",
      secondaryDescription:
        "Translate valuation into measurable conditions and show where the current expectation set loses support.",
    },
    ko: {
      primaryTitle: "이익·밸류에이션 랩",
      primaryDescription:
        "성장이 마진과 현금으로 전환되는 과정을 추적하고 현재 가격이 요구하는 실행 수준을 검증합니다.",
      secondaryTitle: "내재 기대·안전마진",
      secondaryDescription:
        "밸류에이션을 측정 가능한 조건으로 바꾸고 현재 기대가 지지를 잃는 지점을 보여줍니다.",
    },
  },
  risk: {
    en: {
      primaryTitle: "Risk register",
      primaryDescription:
        "Rank failure paths by impact and observability, then identify which risks become dangerous when they compound.",
      secondaryTitle: "Early-warning system & thesis breakers",
      secondaryDescription:
        "Turn risk language into observable alerts, escalation rules, and explicit conditions that break the thesis.",
    },
    ko: {
      primaryTitle: "리스크 레지스터",
      primaryDescription:
        "실패 경로를 영향도와 관찰 가능성으로 분류하고 어떤 위험이 결합될 때 치명적인지 확인합니다.",
      secondaryTitle: "조기경보·논지 파기 조건",
      secondaryDescription:
        "추상적인 위험을 관찰 가능한 경보와 단계별 대응, 투자 논지를 깨는 조건으로 전환합니다.",
    },
  },
};

function observedPrice(file: ResearchFileData): string {
  return file.marketSnapshot === undefined
    ? "—"
    : `${file.marketSnapshot.currency} ${file.marketSnapshot.price}`;
}

function sectionCopy(departmentId: WorkflowDepartmentId, locale: Locale) {
  return COPY[departmentId][locale];
}

function MarketTimingMap({ file, model, locale }: Omit<Props, "departmentId">) {
  const ko = locale === "ko";
  return (
    <>
      <ResearchMetricStrip
        metrics={model.metricGroups.market}
        locale={locale}
      />
      <div className="team-market-regime">
        <div className="team-market-regime__view">
          <span>{ko ? "현재 시장 국면" : "Current market regime"}</span>
          <strong>{model.posture}</strong>
          <p>
            {model.analysisRows[0]?.evidence ??
              model.catalysts[0]?.body ??
              model.directAnswer}
          </p>
        </div>
        <dl className="team-market-regime__metrics">
          <div>
            <dt>{ko ? "관찰 가격" : "Observed price"}</dt>
            <dd>{observedPrice(file)}</dd>
          </div>
          <div>
            <dt>{ko ? "근거 확신도" : "Evidence confidence"}</dt>
            <dd>{model.evidenceReliability}%</dd>
          </div>
          <div>
            <dt>{ko ? "다음 촉매" : "Next catalyst"}</dt>
            <dd>{model.nextVerificationEvent}</dd>
          </div>
        </dl>
      </div>
      <section className="team-market-signals">
        <header>
          <span>{ko ? "신호 원장" : "Signal ledger"}</span>
          <p>
            {ko
              ? "방향보다 먼저 신호의 지속성과 반전 조건을 확인합니다."
              : "Judge persistence and reversal conditions before choosing a direction."}
          </p>
        </header>
        <div>
          {model.analysisRows.slice(0, 3).map((row, index) => (
            <article
              key={row.id}
              data-signal={index === 0 ? "lead" : "support"}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{row.title}</h3>
              <p>{row.evidence}</p>
              <dl>
                <div>
                  <dt>{ko ? "반대 신호" : "Counter-signal"}</dt>
                  <dd>{row.counterpoint}</dd>
                </div>
                <div>
                  <dt>{ko ? "확인 조건" : "Confirmation"}</dt>
                  <dd>{row.checkpoint}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
      <div className="team-market-trigger">
        <div>
          <span>{ko ? "상방 확인" : "Upside confirmation"}</span>
          <strong>
            {model.catalysts[0]?.headline ?? model.nextVerificationEvent}
          </strong>
        </div>
        <div>
          <span>{ko ? "타이밍 무효화" : "Timing invalidation"}</span>
          <strong>
            {model.risks[0]?.headline ?? file.changeCondition[locale]}
          </strong>
        </div>
      </div>
    </>
  );
}

function CompanyGrowthMap({
  file,
  model,
  locale,
}: Omit<Props, "departmentId">) {
  const ko = locale === "ko";
  return (
    <>
      <ResearchMetricStrip
        metrics={model.metricGroups.company.filter(
          (metric) => !metric.id.startsWith("segment_share:"),
        )}
        locale={locale}
      />
      <ResearchSegmentMix
        metrics={model.metricGroups.company}
        locale={locale}
      />
      <div className="team-company-core">
        <span>{ko ? "투자자가 확인할 핵심" : "Investor read-through"}</span>
        <h3>{file.expectation[locale]}</h3>
        <p>{model.nextVerificationEvent}</p>
      </div>
      <section className="team-company-engines">
        <header>
          <span>{ko ? "성장 엔진" : "Growth engines"}</span>
          <strong>{model.analysisRows.length}</strong>
        </header>
        <div>
          {model.analysisRows.slice(0, 3).map((row, index) => (
            <article key={row.id}>
              <div>
                <span>E{index + 1}</span>
                <em>{ko ? "검증 중" : "Under review"}</em>
              </div>
              <h3>{row.title}</h3>
              <p>{row.agentView}</p>
              <dl>
                <div>
                  <dt>{ko ? "입증 근거" : "Proof"}</dt>
                  <dd>{row.evidence}</dd>
                </div>
                <div>
                  <dt>{ko ? "약화 경로" : "Erosion path"}</dt>
                  <dd>{row.counterpoint}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
      <section className="team-company-moat">
        <h3>{ko ? "경쟁우위 층" : "Moat layers"}</h3>
        <ol>
          {model.lensRows.slice(0, 4).map((row, index) => (
            <li key={row.label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{row.label}</strong>
                <p>{row.content}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function FinancialLab({ file, model, locale }: Omit<Props, "departmentId">) {
  const ko = locale === "ko";
  return (
    <>
      <ResearchMetricStrip
        metrics={model.metricGroups.financial
          .filter((metric) => metric.id !== "roic")
          .slice(0, 6)}
        locale={locale}
      />
      <ResearchEvidenceBalance
        balance={model.evidenceBalance}
        locale={locale}
      />
      <section className="team-financial-bridge">
        <header>
          <span>{ko ? "이익 품질 브리지" : "Earnings quality bridge"}</span>
          <p>
            {ko
              ? "성장 → 마진 → 현금 → 가치평가의 연결이 끊기는 지점을 찾습니다."
              : "Find where the chain from growth to margin, cash, and valuation can break."}
          </p>
        </header>
        <div>
          {model.analysisRows.slice(0, 3).map((row, index) => (
            <article key={row.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{row.title}</h3>
              <strong>{row.agentView}</strong>
              <p>{row.evidence}</p>
              <small>{row.checkpoint}</small>
            </article>
          ))}
        </div>
      </section>
      <div className="team-financial-conclusion">
        <span>{ko ? "현재 가치평가 판정" : "Current valuation ruling"}</span>
        <p>{model.valuationConclusion}</p>
        <strong>{observedPrice(file)}</strong>
      </div>
    </>
  );
}

function RiskRegister({ file, model, locale }: Omit<Props, "departmentId">) {
  const ko = locale === "ko";
  const levels = [
    ko ? "핵심 위험" : "Critical",
    ko ? "중대 위험" : "Material",
    ko ? "관찰 위험" : "Watch",
  ] as const;
  return (
    <>
      <ResearchMetricStrip metrics={model.metricGroups.risk} locale={locale} />
      <ResearchEvidenceBalance
        balance={model.evidenceBalance}
        locale={locale}
      />
      <div className="team-risk-summary">
        <span>{ko ? "복합 하방 경로" : "Compound downside path"}</span>
        <h3>
          {model.risks[0]?.headline ??
            model.analysisRows[0]?.counterpoint ??
            model.directAnswer}
        </h3>
        <p>
          {model.risks[0]?.body ??
            model.analysisRows[0]?.checkpoint ??
            file.expectation[locale]}
        </p>
      </div>
      <section className="team-risk-matrix">
        <header>
          <span>{ko ? "우선순위" : "Priority"}</span>
          <span>{ko ? "실패 경로" : "Failure path"}</span>
          <span>{ko ? "조기 관찰" : "Early warning"}</span>
        </header>
        {model.analysisRows.slice(0, 3).map((row, index) => (
          <article key={row.id} data-risk-level={index + 1}>
            <div>
              <strong>R{String(index + 1).padStart(2, "0")}</strong>
              <span>{levels[index]}</span>
            </div>
            <div>
              <h3>{row.title}</h3>
              <p>{row.counterpoint}</p>
            </div>
            <div>
              <span>{ko ? "선행 신호" : "Leading indicator"}</span>
              <p>{row.checkpoint}</p>
            </div>
          </article>
        ))}
      </section>
      <div className="team-risk-escalation">
        <span>{ko ? "즉시 단계 상향 조건" : "Immediate escalation rule"}</span>
        <p>{file.changeCondition[locale]}</p>
      </div>
    </>
  );
}

function MarketFramework({ file, model, locale }: Omit<Props, "departmentId">) {
  const ko = locale === "ko";
  return (
    <>
      <ResearchDecisionPathBoard paths={model.decisionPaths} locale={locale} />
      <div className="team-framework-footer">
        <div>
          <span>{ko ? "다음 관찰 시각" : "Next observation"}</span>
          <strong>{model.nextVerificationEvent}</strong>
        </div>
        <div>
          <span>{ko ? "판단 변경 조건" : "Change condition"}</span>
          <strong>{file.changeCondition[locale]}</strong>
        </div>
      </div>
    </>
  );
}

function CompanyFramework({
  file,
  model,
  locale,
}: Omit<Props, "departmentId">) {
  const ko = locale === "ko";
  return (
    <>
      <div className="team-company-scoreboard">
        <section>
          <h3>{ko ? "누적 성장 조건" : "Compounding conditions"}</h3>
          {model.catalysts.slice(0, 3).map((item) => (
            <article key={item.headline}>
              <span>+</span>
              <div>
                <strong>{item.headline}</strong>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </section>
        <section>
          <h3>{ko ? "경쟁우위 훼손 조건" : "Moat erosion tests"}</h3>
          {model.risks.slice(0, 3).map((item) => (
            <article key={item.headline}>
              <span>−</span>
              <div>
                <strong>{item.headline}</strong>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </section>
      </div>
      <section className="team-company-milestones">
        <h3>{ko ? "다음 실행 증거" : "Next execution proof"}</h3>
        <ol>
          {model.analysisRows.slice(0, 3).map((row, index) => (
            <li key={row.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{row.checkpoint}</strong>
            </li>
          ))}
        </ol>
      </section>
      <div className="team-framework-footer">
        <div>
          <span>{ko ? "다음 공시" : "Next disclosure"}</span>
          <strong>{model.nextVerificationEvent}</strong>
        </div>
        <div>
          <span>{ko ? "해자 무효화 조건" : "Moat invalidation"}</span>
          <strong>{file.changeCondition[locale]}</strong>
        </div>
      </div>
    </>
  );
}

function FinancialFramework({
  file,
  model,
  locale,
}: Omit<Props, "departmentId">) {
  const ko = locale === "ko";
  const scenarios = [
    {
      id: "upside",
      label: ko ? "상방 기대" : "Upside case",
      thesis: model.catalysts[0]?.headline ?? model.directAnswer,
      detail: model.catalysts[0]?.body ?? model.nextVerificationEvent,
    },
    {
      id: "base",
      label: ko ? "현재 기대" : "Current case",
      thesis: model.valuationConclusion,
      detail: model.nextVerificationEvent,
    },
    {
      id: "downside",
      label: ko ? "하방 기대" : "Downside case",
      thesis: model.risks[0]?.headline ?? file.changeCondition[locale],
      detail: model.risks[0]?.body ?? file.changeCondition[locale],
    },
  ] as const;
  return (
    <>
      <section className="team-financial-expectations">
        <header>
          <span>{ko ? "검증 축" : "Test"}</span>
          <span>{ko ? "현재 근거" : "Current evidence"}</span>
          <span>{ko ? "가격이 요구하는 조건" : "What price requires"}</span>
        </header>
        {model.comparisonRows.map((row) => (
          <article key={row.label}>
            <strong>{row.label}</strong>
            <p>{row.companyView}</p>
            <p>{row.interpretation}</p>
          </article>
        ))}
      </section>
      <div className="team-financial-scenarios">
        {scenarios.map((scenario) => (
          <article key={scenario.id}>
            <span>{scenario.label}</span>
            <h3>{scenario.thesis}</h3>
            <p>{scenario.detail}</p>
          </article>
        ))}
      </div>
      <div className="team-financial-threshold">
        <span>
          {ko ? "안전마진을 다시 계산할 조건" : "Safety-margin reset"}
        </span>
        <p>{file.changeCondition[locale]}</p>
        <strong>{observedPrice(file)}</strong>
      </div>
    </>
  );
}

function RiskFramework({ file, model, locale }: Omit<Props, "departmentId">) {
  const ko = locale === "ko";
  return (
    <>
      <section className="team-risk-alerts">
        <h3>{ko ? "경보 사다리" : "Alert ladder"}</h3>
        {model.analysisRows.slice(0, 3).map((row, index) => (
          <article key={row.id} data-alert={index + 1}>
            <span>{ko ? `${index + 1}단계` : `Level ${index + 1}`}</span>
            <div>
              <strong>{row.checkpoint}</strong>
              <p>{row.counterpoint}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="team-risk-mitigants">
        <h3>{ko ? "하방 완충 요인" : "Downside mitigants"}</h3>
        <div>
          {model.catalysts.slice(0, 3).map((item, index) => (
            <article key={item.headline}>
              <span>M{index + 1}</span>
              <strong>{item.headline}</strong>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>
      <div className="team-risk-breaker">
        <span>{ko ? "투자 논지 파기 조건" : "Thesis breaker"}</span>
        <p>{file.changeCondition[locale]}</p>
        <small>
          {ko ? "다음 재평가 이벤트" : "Next reassessment"} ·{" "}
          {model.nextVerificationEvent}
        </small>
      </div>
    </>
  );
}

export function ResearchFileDepartmentBrief({
  departmentId,
  file,
  model,
  locale,
}: Props) {
  const copy = sectionCopy(departmentId, locale);
  const shared = { file, model, locale };
  return (
    <section
      className="research-editorial-section research-department-section"
      data-report-section="decision"
      data-department-layout={departmentId}
      id="decision-brief"
    >
      <ResearchFileSectionHeader
        number="01"
        title={copy.primaryTitle}
        description={copy.primaryDescription}
      />
      {departmentId === "market" ? <MarketTimingMap {...shared} /> : null}
      {departmentId === "company" ? <CompanyGrowthMap {...shared} /> : null}
      {departmentId === "financial" ? <FinancialLab {...shared} /> : null}
      {departmentId === "risk" ? <RiskRegister {...shared} /> : null}
    </section>
  );
}

export function ResearchFileDepartmentFramework({
  departmentId,
  file,
  model,
  locale,
}: Props) {
  const copy = sectionCopy(departmentId, locale);
  const shared = { file, model, locale };
  return (
    <section
      className="research-editorial-section research-department-section"
      data-report-section="scenarios"
      data-department-layout={departmentId}
      id="decision-scenarios"
    >
      <ResearchFileSectionHeader
        number="02"
        title={copy.secondaryTitle}
        description={copy.secondaryDescription}
      />
      {departmentId === "market" ? <MarketFramework {...shared} /> : null}
      {departmentId === "company" ? <CompanyFramework {...shared} /> : null}
      {departmentId === "financial" ? <FinancialFramework {...shared} /> : null}
      {departmentId === "risk" ? <RiskFramework {...shared} /> : null}
    </section>
  );
}

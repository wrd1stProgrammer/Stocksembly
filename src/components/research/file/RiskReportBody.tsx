import {
  type DepartmentReportBodyProps,
  departmentSectionCopy,
} from "./DepartmentReportShared";
import { ResearchFileSectionHeader } from "./ResearchFilePrimitives";
import { rankStructuredRisks } from "./RiskReportModel";
import styles from "./risk-report.module.css";

function formatRiskMetric(value: number, unit: string, locale: "en" | "ko") {
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "multiple") return `${value.toFixed(1)}×`;
  if (unit === "USD_per_share") return `$${value.toFixed(2)}`;
  if (unit === "USD") {
    const billions = value / 1_000_000_000;
    return `$${billions.toFixed(1)}B`;
  }
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { maximumFractionDigits: 1 }).format(value);
}

export function RiskReportBrief({ file, locale }: DepartmentReportBodyProps) {
  const ko = locale === "ko";
  const copy = departmentSectionCopy("risk", locale);
  const risks = rankStructuredRisks(file, locale);
  const downside = risks.filter((risk) => risk.dimension === "downside_path");
  const indicators = risks.filter(
    (risk) => risk.dimension === "leading_indicator",
  );
  const exposureMetrics = (file.metricSnapshot?.metrics ?? [])
    .filter((metric) => metric.category === "risk")
    .slice(0, 6);
  const impactLabel = (value: "high" | "moderate") =>
    ko ? (value === "high" ? "높음" : "중간") : value;
  const observeLabel = (
    value: "measurable" | "observable" | "limited",
  ) =>
    ko
      ? value === "measurable"
        ? "수치 확인"
        : value === "observable"
          ? "정성 확인"
          : "제한적"
      : value;
  return (
    <section
      className="research-editorial-section research-department-section"
      data-report-section="decision"
      data-department-layout="risk"
      id="decision-brief"
    >
      <ResearchFileSectionHeader
        number="01"
        title={copy.primaryTitle}
        description={copy.primaryDescription}
      />
      {exposureMetrics.length === 0 ? null : (
        <section className={styles["exposureTape"]} data-risk-exposure-count={exposureMetrics.length}>
          {exposureMetrics.map((metric) => (
            <article key={`${metric.id}:${metric.period ?? metric.observedAt}`} data-source-id={metric.source}>
              <span>{metric.label[locale]}</span>
              <strong>{formatRiskMetric(metric.value, metric.unit, locale)}</strong>
              <small>{metric.period ?? metric.observedAt.slice(0, 10)}</small>
            </article>
          ))}
        </section>
      )}
      {risks.length === 0 ? (
        <details className={styles["dataNote"]}>
          <summary>
            {ko ? "우선순위 산정 기준" : "Priority-model detail"}
          </summary>
          <p>
            {ko
              ? "구조화된 영향도와 관찰 가능성이 모두 있는 위험만 순위표에 포함합니다."
              : "Only risks with structured impact and observability inputs enter the ranked register."}
          </p>
        </details>
      ) : (
        <section className={styles["heatmap"]} data-risk-heatmap="structured">
          <header>
            <span>
              {ko ? "영향도 × 관찰 가능성" : "Impact × observability"}
            </span>
            <small>{ko ? "점수 내림차순" : "Descending evidence score"}</small>
          </header>
          <ol>
            {risks.map((risk, index) => (
              <li
                key={risk.claimId}
                data-risk-claim-id={risk.claimId}
                data-risk-impact={risk.impact}
                data-risk-observability={risk.observability}
                data-risk-score={risk.priorityScore}
                data-evidence-ids={risk.evidenceArtifactIds.join(",")}
                data-metric-ids={risk.decisiveMetricIds.join(",")}
              >
                <div>
                  <strong>P{index + 1}</strong>
                  <span>{risk.priorityScore}/7</span>
                </div>
                <p>{risk.thesis}</p>
                <dl>
                  <div>
                    <dt>{ko ? "영향" : "Impact"}</dt>
                    <dd>{impactLabel(risk.impact)}</dd>
                  </div>
                  <div>
                    <dt>{ko ? "관찰" : "Observe"}</dt>
                    <dd>{observeLabel(risk.observability)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        </section>
      )}
      {downside.length === 0 ? null : (
        <section
          className={styles["causalPath"]}
          data-risk-causal-path="structured"
        >
          <h3>{ko ? "복합 하방 인과 경로" : "Compound downside path"}</h3>
          {downside.map((risk) => (
            <article key={risk.claimId} data-risk-claim-id={risk.claimId}>
              <div>
                <span>{ko ? "재무 전이 지표" : "Financial transmission"}</span>
                <p>
                  {risk.decisiveMetricIds.length === 0
                    ? ko
                      ? "매출·마진·현금흐름의 동시 변화를 확인"
                      : "Watch the joint move in revenue, margin, and cash flow"
                    : risk.decisiveMetricIds.join(" · ").replaceAll("_", " ")}
                </p>
              </div>
              <div>
                <span>{ko ? "관찰 신호" : "Observable signal"}</span>
                <p>{risk.indicator}</p>
              </div>
            </article>
          ))}
        </section>
      )}
      {indicators.length === 0 ? null : (
        <section
          className={styles["trafficLights"]}
          aria-labelledby="leading-indicators-title"
        >
          <h3 id="leading-indicators-title">
            {ko ? "선행지표 신호등" : "Leading-indicator lights"}
          </h3>
          <div>
            {indicators.map((risk) => (
              <article
                key={risk.claimId}
                data-signal={risk.signal}
                data-risk-claim-id={risk.claimId}
              >
                <span role="img" aria-label={risk.signal} />
                <p>{risk.indicator}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export function RiskReportFramework({
  file,
  locale,
}: DepartmentReportBodyProps) {
  const ko = locale === "ko";
  const copy = departmentSectionCopy("risk", locale);
  const risks = rankStructuredRisks(file, locale);
  const mitigants = risks.filter((risk) => risk.dimension === "mitigant");
  const indicators = risks.filter((risk) => risk.dimension === "leading_indicator");
  const breaker = risks.find((risk) => risk.dimension === "downside_path");
  const scenarios = file.scenarios.slice(0, 3);
  return (
    <section
      className="research-editorial-section research-department-section"
      data-report-section="escalation"
      data-department-layout="risk"
      id="decision-scenarios"
    >
      <ResearchFileSectionHeader
        number="02"
        title={copy.secondaryTitle}
        description={copy.secondaryDescription}
      />
      {scenarios.length === 0 && indicators.length === 0 ? null : (
        <section
          className={styles["ladder"]}
          aria-labelledby="escalation-title"
        >
          <h3 id="escalation-title">
            {ko ? "증거 기반 단계 상향" : "Evidence-led escalation"}
          </h3>
          {(indicators.length === 0 ? risks : indicators).slice(0, 4).map((risk, index) => (
            <article
              key={risk.claimId}
              data-escalation-score={risk.priorityScore}
            >
              <span>{ko ? `${index + 1}단계` : `Level ${index + 1}`}</span>
              <div>
                <strong>{risk.indicator}</strong>
                <small>
                  {ko
                    ? `우선순위 ${risk.priorityScore}/7`
                    : `Priority ${risk.priorityScore}/7`}
                </small>
              </div>
            </article>
          ))}
        </section>
      )}
      {scenarios.length === 0 ? null : (
        <section className={styles["scenarios"]} data-risk-scenarios={scenarios.length}>
          <header>
            <span>{ko ? "하방 시나리오" : "DOWNSIDE SCENARIOS"}</span>
            <h3>{ko ? "위험이 손익과 판단으로 전이되는 순서를 봅니다" : "Trace how risk reaches earnings and the investment call"}</h3>
          </header>
          <div>
            {scenarios.map((scenario, index) => (
              <article key={scenario.id}>
                <span>S{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{scenario.label[locale]}</h3>
                  <strong>{scenario.thesis[locale]}</strong>
                  <ul>
                    {scenario.assumptions.slice(0, 3).map((assumption, assumptionIndex) => (
                      <li key={`${scenario.id}:${assumptionIndex}`}>
                        {assumption.kind === "metric"
                          ? `${assumption.metric[locale]} · ${assumption.displayValue[locale]}`
                          : assumption.note[locale]}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className={styles["separation"]}>
        {mitigants.length === 0 ? null : (
          <section data-risk-mitigants="structured">
            <h3>{ko ? "완충 요인" : "Mitigants"}</h3>
            {mitigants.map((risk) => (
              <p key={risk.claimId}>{risk.thesis}</p>
            ))}
          </section>
        )}
        {breaker === undefined ? null : (
          <section data-risk-thesis-breaker={breaker.claimId}>
            <h3>{ko ? "논지 파기 조건" : "Thesis breaker"}</h3>
            <p>{breaker.indicator}</p>
          </section>
        )}
      </div>
    </section>
  );
}

import {
  type DepartmentReportBodyProps,
  departmentSectionCopy,
} from "./DepartmentReportShared";
import {
  ResearchFileSectionHeader,
  ResearchInlineHelp,
  ResearchTermHelp,
} from "./ResearchFilePrimitives";
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
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}

function publicRiskMetricId(metricId: string): string | undefined {
  const normalized = metricId.toLowerCase();
  if (normalized.includes("quote.last_price")) return "current_price";
  if (normalized.includes("enterprise_value_ebitda")) return "ev_ebitda";
  if (normalized.includes("revenue_estimate_ntm")) return "forward_revenue";
  if (normalized.includes("free_cash_flow")) return "free_cash_flow";
  if (normalized.includes("cash_n_short_term")) return "cash";
  if (normalized.includes("operating_margin")) return "operating_margin";
  if (normalized.includes("accounts_receivables")) return undefined;
  return /insightsentry|rapidapi|provider/iu.test(normalized)
    ? undefined
    : metricId;
}

function riskMetricDescription(metricId: string, locale: "en" | "ko") {
  const id = metricId.toLowerCase();
  const descriptions = locale === "ko";
  if (id.includes("price"))
    return descriptions
      ? "현재 거래 가격으로, 다른 위험 지표와 밸류에이션 부담을 해석하는 기준점입니다."
      : "The current trading price used as the reference point for valuation and downside risk.";
  if (id.includes("debt") || id.includes("leverage"))
    return descriptions
      ? "자본 대비 부채 부담으로, 금리와 현금흐름 악화에 대한 재무 민감도를 보여줍니다."
      : "Debt burden relative to capital, showing sensitivity to rates and weaker cash flow.";
  if (id.includes("ev_ebitda") || id.includes("enterprise_value_ebitda"))
    return descriptions
      ? "기업가치를 EBITDA와 비교한 배수로, 영업현금 창출력 대비 가격 부담을 봅니다."
      : "Enterprise value relative to EBITDA, used to read valuation pressure against operating cash earnings.";
  if (id.includes("market_cap"))
    return descriptions
      ? "주가와 발행주식 수로 계산한 시장 가치로, 기대가 이미 반영된 규모를 뜻합니다."
      : "Equity market value derived from price and shares, indicating the scale of expectations already priced in.";
  if (id.includes("volume"))
    return descriptions
      ? "거래된 주식 수로, 가격 움직임에 실제 수급 참여가 동반됐는지 확인합니다."
      : "Shares traded, used to check whether price moves are supported by participation.";
  if (id.includes("gross_margin"))
    return descriptions
      ? "매출에서 직접 원가를 제외한 비율로, 가격 결정력과 원가 압력을 보여줍니다."
      : "Revenue left after direct costs, indicating pricing power and cost pressure.";
  if (id.includes("operating_margin"))
    return descriptions
      ? "영업비용까지 제외한 이익률로, 본업의 비용 통제력과 수익성을 보여줍니다."
      : "Profit after operating costs, indicating core cost control and profitability.";
  if (id.includes("free_cash_flow"))
    return descriptions
      ? "영업현금에서 설비투자를 뺀 현금으로, 부채 상환과 재투자 여력을 보여줍니다."
      : "Cash left after capital spending, indicating capacity for debt service and reinvestment.";
  if (id.includes("cash"))
    return descriptions
      ? "즉시 활용 가능한 현금성 자산으로, 충격을 흡수할 수 있는 완충력을 뜻합니다."
      : "Liquid cash resources available to absorb operating or financing shocks.";
  if (id.includes("revenue"))
    return descriptions
      ? "기업의 매출 규모 또는 전망으로, 하방 위험이 실제 수요 약화로 번지는지 확인합니다."
      : "Reported or expected revenue, used to see whether downside risk is reaching demand.";
  return descriptions
    ? "이 지표의 변화는 위험의 크기와 현실화 속도를 판단하는 관찰 근거로 사용됩니다."
    : "Changes in this metric help assess the size and speed of risk transmission.";
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
  const metricsById = new Map(
    (file.metricSnapshot?.metrics ?? []).map((metric) => [metric.id, metric]),
  );
  const publicMetricSummary = (metricIds: readonly string[]) => {
    const seen = new Set<string>();
    return metricIds
      .flatMap((metricId) => {
        const publicId = publicRiskMetricId(metricId);
        if (publicId === undefined || seen.has(publicId)) return [];
        seen.add(publicId);
        const metric = metricsById.get(publicId);
        return metric === undefined
          ? []
          : [
              `${metric.label[locale]} ${formatRiskMetric(metric.value, metric.unit, locale)}`,
            ];
      })
      .join(" · ");
  };
  const impactLabel = (value: "high" | "moderate") =>
    ko ? (value === "high" ? "높음" : "중간") : value;
  const observeLabel = (value: "measurable" | "observable" | "limited") =>
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
        help={{ term: "riskRegister", locale }}
      />
      {exposureMetrics.length === 0 ? null : (
        <section
          className={styles["exposureTape"]}
          data-risk-exposure-count={exposureMetrics.length}
        >
          {exposureMetrics.map((metric) => (
            <article
              key={`${metric.id}:${metric.period ?? metric.observedAt}`}
              data-source-id={metric.source}
            >
              <ResearchInlineHelp
                label={metric.label[locale]}
                description={riskMetricDescription(metric.id, locale)}
                locale={locale}
              />
              <strong>
                {formatRiskMetric(metric.value, metric.unit, locale)}
              </strong>
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
            <ResearchTermHelp
              term="impactObservability"
              label={ko ? "영향도 × 관찰 가능성" : "Impact × observability"}
              locale={locale}
            />
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
                data-metric-ids={risk.decisiveMetricIds
                  .flatMap((metricId) => publicRiskMetricId(metricId) ?? [])
                  .join(",")}
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
                <ResearchTermHelp
                  term="financialTransmission"
                  label={ko ? "재무 전이 지표" : "Financial transmission"}
                  locale={locale}
                />
                <p>
                  {publicMetricSummary(risk.decisiveMetricIds) ||
                    (ko
                      ? "매출·마진·현금흐름의 동시 변화를 확인"
                      : "Watch the joint move in revenue, margin, and cash flow")}
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
          <h3
            id="leading-indicators-title"
            aria-label={ko ? "선행지표 신호등" : "Leading-indicator lights"}
          >
            <ResearchTermHelp
              term="leadingIndicator"
              label={ko ? "선행지표 신호등" : "Leading-indicator lights"}
              locale={locale}
            />
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
  const indicators = risks.filter(
    (risk) => risk.dimension === "leading_indicator",
  );
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
          {(indicators.length === 0 ? risks : indicators)
            .slice(0, 4)
            .map((risk, index) => (
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
        <section
          className={styles["scenarios"]}
          data-risk-scenarios={scenarios.length}
        >
          <header>
            <span>{ko ? "하방 시나리오" : "DOWNSIDE SCENARIOS"}</span>
            <h3>
              {ko
                ? "위험이 손익과 판단으로 전이되는 순서를 봅니다"
                : "Trace how risk reaches earnings and the investment call"}
            </h3>
          </header>
          <div>
            {scenarios.map((scenario, index) => (
              <article key={scenario.id}>
                <span>S{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{scenario.label[locale]}</h3>
                  <strong>{scenario.thesis[locale]}</strong>
                  <ul>
                    {scenario.assumptions.slice(0, 3).map((assumption) => {
                      const assumptionKey =
                        assumption.kind === "metric"
                          ? `${assumption.kind}:${assumption.metric.en}:${assumption.displayValue.en}`
                          : `${assumption.kind}:${assumption.note.en}`;
                      return (
                        <li key={`${scenario.id}:${assumptionKey}`}>
                          {assumption.kind === "metric"
                            ? `${assumption.metric[locale]} · ${assumption.displayValue[locale]}`
                            : assumption.note[locale]}
                        </li>
                      );
                    })}
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

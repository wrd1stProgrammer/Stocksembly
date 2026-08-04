import { workflowRoleById } from "../../../research/domain/roleRegistry";
import {
  claimOwnedCheckpoint,
  type DepartmentReportBodyProps,
  departmentSectionCopy,
} from "./DepartmentReportShared";
import {
  FINANCIAL_BRIDGE_METRIC_IDS,
  formatFinancialMetric,
  selectAlignedFinancialPeriods,
  selectAuditableValuation,
  selectFinancialDiagnostics,
  selectFinancialExpectations,
} from "./FinancialReportModel";
import styles from "./financial-report.module.css";
import { ResearchFileSectionHeader } from "./ResearchFilePrimitives";

function Sparkline({ values }: { readonly values: readonly number[] }) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 28 - ((value - minimum) / range) * 24;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" role="img" aria-label="Historical trend">
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function FinancialReportBrief({
  file,
  model,
  locale,
}: DepartmentReportBodyProps) {
  const ko = locale === "ko";
  const copy = departmentSectionCopy("financial", locale);
  const periods = selectAlignedFinancialPeriods(file);
  const diagnostics = selectFinancialDiagnostics(file);
  const snapshot = (file.metricSnapshot?.metrics ?? [])
    .filter((metric) => metric.category === "financial")
    .slice(0, 6);
  const financialClaims = (model.structuredClaims ?? []).filter(
    (claim) => workflowRoleById(claim.roleOwner)?.departmentId === "financial",
  );
  return (
    <section
      className="research-editorial-section research-department-section"
      data-report-section="decision"
      data-department-layout="financial"
      id="decision-brief"
    >
      <ResearchFileSectionHeader
        number="01"
        title={copy.primaryTitle}
        description={copy.primaryDescription}
      />
      {diagnostics.length === 0 ? null : (
        <section
          className={styles["diagnostics"]}
          data-financial-diagnostics={diagnostics.length}
        >
          {diagnostics.map((diagnostic) => (
            <article
              key={diagnostic.id}
              data-source-ids={diagnostic.sourceIds.join(",")}
            >
              <span>{diagnostic.label[locale]}</span>
              <strong>{diagnostic.value.toFixed(1)}%</strong>
              <p>{diagnostic.interpretation[locale]}</p>
            </article>
          ))}
        </section>
      )}
      {periods.length === 0 ? (
        <section
          className={styles["snapshot"]}
          data-financial-snapshot="current"
        >
          {snapshot.map((metric) => (
            <article key={metric.id}>
              <span>{metric.label[locale]}</span>
              <strong>{formatFinancialMetric(metric, locale)}</strong>
              <small>{metric.period ?? metric.observedAt.slice(0, 10)}</small>
            </article>
          ))}
          {snapshot.length === 0
            ? financialClaims.slice(0, 3).map((claim) => (
                <article
                  key={claim.claimId}
                  className={styles["snapshotClaim"]}
                >
                  <span>{claim.decisionDimension.replaceAll("_", " ")}</span>
                  <p>{claim.publicThesis[locale]}</p>
                </article>
              ))
            : null}
        </section>
      ) : (
        <section
          className={styles["bridge"]}
          data-financial-bridge="period-aligned"
          data-financial-metric-ids={FINANCIAL_BRIDGE_METRIC_IDS.join(",")}
          aria-labelledby="financial-bridge-title"
        >
          <header>
            <div>
              <span>
                {ko
                  ? "기간 정렬 손익·현금 브리지"
                  : "Period-aligned earnings & cash bridge"}
              </span>
              <h3 id="financial-bridge-title">
                {ko
                  ? "매출이 마진을 거쳐 현금과 재투자로 전환되는가"
                  : "Does revenue convert through margins into cash and reinvestment?"}
              </h3>
            </div>
            <small>{file.metricSnapshot?.asOf.slice(0, 10)}</small>
          </header>
          <section
            className={styles["trends"]}
            aria-label={ko ? "역사적 추세" : "Historical trends"}
          >
            {FINANCIAL_BRIDGE_METRIC_IDS.map((metricId) => {
              const metric = periods.at(-1)?.metrics[metricId];
              if (metric === undefined) return null;
              const first = periods[0]?.metrics[metricId];
              const delta =
                first === undefined ? 0 : metric.value - first.value;
              const deltaLabel =
                metric.unit === "percent"
                  ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%p`
                  : first === undefined || first.value === 0
                    ? "—"
                    : `${((delta / Math.abs(first.value)) * 100) >= 0 ? "+" : ""}${((delta / Math.abs(first.value)) * 100).toFixed(1)}%`;
              return (
                <figure key={metricId} data-financial-trend={metricId}>
                  <figcaption>
                    <span>{metric.label[locale]}</span>
                    <strong>{formatFinancialMetric(metric, locale)}</strong>
                    <em data-direction={delta >= 0 ? "up" : "down"}>
                      {deltaLabel}
                    </em>
                  </figcaption>
                  <Sparkline
                    values={periods.map(
                      (period) => period.metrics[metricId].value,
                    )}
                  />
                </figure>
              );
            })}
          </section>
          <div className={styles["tableWrap"]}>
            <table>
              <thead>
                <tr>
                  <th>{ko ? "기간" : "Period"}</th>
                  {FINANCIAL_BRIDGE_METRIC_IDS.map((metricId) => (
                    <th key={metricId}>
                      {periods[0]?.metrics[metricId].label[locale]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.period} data-financial-period={period.period}>
                    <th>{period.period}</th>
                    {FINANCIAL_BRIDGE_METRIC_IDS.map((metricId) => {
                      const metric = period.metrics[metricId];
                      return (
                        <td
                          key={metricId}
                          data-metric-id={metric.id}
                          data-metric-source={metric.source}
                        >
                          {formatFinancialMetric(metric, locale)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

export function FinancialReportFramework({
  file,
  model,
  locale,
}: DepartmentReportBodyProps) {
  const ko = locale === "ko";
  const copy = departmentSectionCopy("financial", locale);
  const expectations = selectFinancialExpectations(file);
  const valuation = selectAuditableValuation(model.comparatorQualification);
  const checkpoint = claimOwnedCheckpoint(model, "financial", locale);
  const structuredTests = (model.structuredClaims ?? []).filter(
    (claim) => workflowRoleById(claim.roleOwner)?.departmentId === "financial",
  );
  const claimTests =
    structuredTests.length > 0
      ? structuredTests.map((claim) => ({
          id: claim.claimId,
          thesis: claim.publicThesis[locale],
          falsifier: claim.falsifier[locale],
        }))
      : model.analysisRows.slice(0, 3).map((row) => ({
          id: row.id,
          thesis: row.evidence,
          falsifier: row.checkpoint,
        }));
  return (
    <section
      className="research-editorial-section research-department-section"
      data-report-section="expectations"
      data-department-layout="financial"
      id="decision-scenarios"
    >
      <ResearchFileSectionHeader
        number="02"
        title={copy.secondaryTitle}
        description={copy.secondaryDescription}
      />
      {expectations.length === 0 ? null : (
        <section
          className={styles["expectations"]}
          aria-labelledby="expectations-title"
        >
          <h3 id="expectations-title">
            {ko
              ? "관측된 내재 기대 입력"
              : "Observed implied-expectation inputs"}
          </h3>
          <div data-metric-count={expectations.length}>
            {expectations.map((metric) => (
              <article
                key={`${metric.id}:${metric.period ?? metric.observedAt}`}
                data-expectation-metric-id={metric.id}
                data-metric-source={metric.source}
              >
                <span>{metric.label[locale]}</span>
                <strong>{formatFinancialMetric(metric, locale)}</strong>
                <small>{metric.period ?? metric.observedAt.slice(0, 10)}</small>
              </article>
            ))}
          </div>
        </section>
      )}
      {claimTests.length === 0 ? null : (
        <section
          className={styles["claimTests"]}
          data-financial-expectation-tests="claims"
        >
          <h3>
            {ko
              ? "현재 가격을 검증할 운영 질문"
              : "Operating tests for the current price"}
          </h3>
          <ol>
            {claimTests.slice(0, 6).map((claim, index) => (
              <li key={claim.id}>
                <span>TEST {String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{claim.thesis}</strong>
                  {claim.falsifier.trim() === claim.thesis.trim() ? null : (
                    <p>{claim.falsifier}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {valuation === undefined ? null : (
        <section
          className={styles["valuation"]}
          data-valuation-comparison={valuation.metricKey}
          data-valuation-evidence-ids={valuation.evidenceArtifactIds.join(",")}
          aria-labelledby="valuation-comparison-title"
        >
          <header>
            <h3 id="valuation-comparison-title">
              {ko ? "검증된 상대 가치평가" : "Qualified relative valuation"}
            </h3>
            <span>{valuation.period}</span>
          </header>
          <div className={styles["valuationSummary"]}>
            <div>
              <span>{ko ? "대상" : "Subject"}</span>
              <strong>{valuation.subjectValue.toFixed(1)}×</strong>
            </div>
            <div>
              <span>{ko ? "동종 중앙값" : "Peer median"}</span>
              <strong>{valuation.peerMedian.toFixed(1)}×</strong>
            </div>
            <div>
              <span>{ko ? "프리미엄·할인" : "Premium / discount"}</span>
              <strong>{valuation.premiumDiscountPercent.toFixed(1)}%</strong>
            </div>
          </div>
          <ul>
            {valuation.peers.map((peer) => (
              <li
                key={peer.comparatorId}
                data-comparator-id={peer.comparatorId}
                data-evidence-ids={peer.evidenceArtifactIds.join(",")}
              >
                <span>{peer.name}</span>
                <strong>{peer.value.toFixed(1)}×</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      {checkpoint === undefined ? null : (
        <aside
          className={styles["checkpoint"]}
          data-financial-checkpoint="claim-owned"
        >
          <span>{ko ? "검증 조건" : "Verification condition"}</span>
          <p>{checkpoint}</p>
        </aside>
      )}
    </section>
  );
}

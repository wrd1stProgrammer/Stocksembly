import type { CSSProperties } from "react";
import type { Locale } from "../../../lib/i18n";
import styles from "./CompanyReportBody.module.css";
import {
  buildCompanyReportProduct,
  formatCompanyMetric,
} from "./CompanyReportProduct";
import type { DepartmentReportBodyProps } from "./DepartmentReportShared";
import { ResearchTermHelp } from "./ResearchFilePrimitives";

function MetricIdentity({
  id,
  period,
  source,
  locale,
}: {
  readonly id: string;
  readonly period: string;
  readonly source: string;
  readonly locale: Locale;
}) {
  return (
    <small
      className={styles.identity}
      data-metric-id={id}
      data-source-id={source}
      data-period={period}
    >
      {locale === "ko" ? `기준 ${period}` : `As of ${period}`}
    </small>
  );
}

export function CompanyReportBrief(props: DepartmentReportBodyProps) {
  const { file, model, locale } = props;
  const ko = locale === "ko";
  const product = buildCompanyReportProduct(file, model, locale);
  const engineClaims = [
    ...product.growthEngines,
    ...product.adoptionClaims,
  ].slice(0, 6);
  const moatClaims =
    product.moatLayers.length === 0
      ? product.claims.slice(0, 3)
      : product.moatLayers;
  return (
    <section
      className={`${styles.section} research-editorial-section research-department-section`}
      data-report-section="company-business"
      data-department-layout="company"
      id="company-business"
    >
      <header className={styles.chapter}>
        <span>COMPANY / A</span>
        <h2>
          {ko ? "사업 엔진·채택 증거" : "Business engines & adoption proof"}
        </h2>
        <p>
          {ko
            ? "사업 구성을 먼저 읽고, 실제 채택 지표가 성장 논지를 뒷받침하는지 검증합니다."
            : "Read the business mix first, then verify whether adoption metrics support the growth thesis."}
        </p>
      </header>

      {product.operatingSnapshot.length === 0 ? null : (
        <section
          className={styles.operatingTape}
          data-company-landmark="operating-snapshot"
        >
          {product.operatingSnapshot.slice(0, 6).map((metric) => (
            <article key={metric.id}>
              <span>{metric.label[locale]}</span>
              <strong>{formatCompanyMetric(metric, locale)}</strong>
              <MetricIdentity
                id={metric.id}
                period={metric.period}
                source={metric.source}
                locale={locale}
              />
            </article>
          ))}
        </section>
      )}

      {product.segments === undefined ? null : (
        <section
          className={styles.segmentMix}
          data-company-landmark="segment-mix"
        >
          <header>
            <div>
              <ResearchTermHelp
                term="segmentMix"
                label={ko ? "사업부 구성" : "Segment mix"}
                locale={locale}
              />
              <strong>{product.segments.length}</strong>
            </div>
            <p>
              {ko
                ? "공시된 사업부별 매출 비중"
                : "Reported revenue mix by business segment"}
            </p>
          </header>
          <div>
            {product.segments.map((segment) => (
              <article key={segment.id}>
                <div>
                  <h3>{segment.label[locale]}</h3>
                  <strong>{formatCompanyMetric(segment, locale)}</strong>
                </div>
                <i
                  role="progressbar"
                  aria-label={`${segment.label[locale]} ${formatCompanyMetric(segment, locale)}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={segment.value}
                >
                  <b
                    style={
                      {
                        "--segment-share": `${Math.max(0, Math.min(100, segment.value))}%`,
                      } as CSSProperties
                    }
                  />
                </i>
                <MetricIdentity
                  id={segment.id}
                  period={segment.period}
                  source={segment.source}
                  locale={locale}
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {product.adoptionProof.length === 0 ? null : (
        <aside
          className={styles.adoption}
          data-company-landmark="adoption-proof"
        >
          <ResearchTermHelp
            term="adoptionProof"
            label={ko ? "채택 입증" : "Adoption proof"}
            locale={locale}
          />
          {product.adoptionProof.map((claim) => (
            <article key={claim.id}>
              <h3>{claim.thesis}</h3>
              <div>
                {claim.metrics.map((metric) => (
                  <p key={metric.id}>
                    <strong>{formatCompanyMetric(metric, locale)}</strong>
                    <MetricIdentity
                      id={metric.id}
                      period={metric.period}
                      source={metric.source}
                      locale={locale}
                    />
                  </p>
                ))}
              </div>
            </article>
          ))}
        </aside>
      )}

      {engineClaims.length === 0 ? null : (
        <section
          className={styles.engineGrid}
          data-company-landmark="growth-adoption-ledger"
        >
          <header>
            <span>{ko ? "사업 메커니즘" : "BUSINESS MECHANISM"}</span>
            <h3>
              {ko
                ? "성장 동력과 채택 증거를 분리해 읽습니다"
                : "Separate the growth engine from adoption proof"}
            </h3>
          </header>
          <div data-card-count={engineClaims.length}>
            {engineClaims.map((claim, index) => (
              <article key={claim.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <small>
                  {claim.dimension === "growth_engine"
                    ? ko
                      ? "성장 엔진"
                      : "Growth engine"
                    : ko
                      ? "채택 증거"
                      : "Adoption"}
                </small>
                <strong>{claim.thesis}</strong>
                <p>{claim.falsifier}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {moatClaims.length === 0 ? null : (
        <section
          className={styles.moat}
          data-company-landmark="moat-verification"
        >
          <h3>{ko ? "해자 층별 검증" : "Moat-layer verification"}</h3>
          <ol data-item-count={moatClaims.length}>
            {moatClaims.map((claim, index) => (
              <li key={claim.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{claim.thesis}</strong>
                  <p>{claim.falsifier}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}

export function CompanyReportFramework(props: DepartmentReportBodyProps) {
  const { file, model, locale } = props;
  const ko = locale === "ko";
  const product = buildCompanyReportProduct(file, model, locale);
  return (
    <section
      className={`${styles.section} research-editorial-section research-department-section`}
      data-report-section="company-moat"
      data-department-layout="company"
      id="company-moat"
    >
      <header className={styles.chapter}>
        <span>COMPANY / B</span>
        <h2>
          {ko
            ? "경쟁 좌표·실행 사다리"
            : "Competitive coordinates & execution ladder"}
        </h2>
      </header>

      {product.comparatorRows.length === 0 ? null : (
        <section
          className={styles.peers}
          data-company-landmark="qualified-peer-comparison"
        >
          <header>
            <h3>
              {ko
                ? "성장·마진·밸류에이션 비교"
                : "Growth, margin & valuation comparison"}
            </h3>
            <p>
              {ko
                ? "자격 검증을 통과한 비교기업만 표시"
                : "Only qualification-passed comparators are shown"}
            </p>
          </header>
          <table>
            <tbody>
              {product.comparatorRows.map((row) => (
                <tr
                  key={row.comparatorId}
                  data-comparator-id={row.comparatorId}
                  data-comparator-role={row.role}
                >
                  <th scope="row">
                    <strong>{row.name}</strong>
                    <span>{row.role.replaceAll("_", " ")}</span>
                  </th>
                  {row.normalizedMetrics.map((metric) => (
                    <td
                      key={metric.key}
                      data-metric-id={metric.key}
                      data-source-id={metric.evidenceArtifactIds.join(",")}
                    >
                      <span>{metric.key.replaceAll("_", " ")}</span>
                      <strong>
                        {metric.value}
                        {metric.unit === "percent"
                          ? "%"
                          : metric.unit === "multiple"
                            ? "x"
                            : ""}
                      </strong>
                      <small>
                        {locale === "ko"
                          ? `비교 기준 ${metric.period}`
                          : `Comparable period ${metric.period}`}
                      </small>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {product.milestones.length === 0 &&
      product.erosion.length === 0 ? null : (
        <section
          className={styles.ladder}
          data-company-landmark="milestone-erosion-ladder"
        >
          <header>
            <h3>
              {ko ? "마일스톤·훼손 사다리" : "Milestone & erosion ladder"}
            </h3>
          </header>
          <div>
            <ol>
              {product.milestones.map((claim) => (
                <li key={claim.id}>
                  <span>+</span>
                  <strong>{claim.thesis}</strong>
                  <p>{claim.falsifier}</p>
                </li>
              ))}
            </ol>
            {product.erosion.length === 0 ? null : (
              <ol>
                {product.erosion.map((claim) => (
                  <li key={claim.id}>
                    <span>−</span>
                    <strong>{claim.thesis}</strong>
                    <p>{claim.falsifier}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}
    </section>
  );
}

import type { CSSProperties } from "react";
import type { Locale } from "../../../lib/i18n";
import type { DepartmentReportBodyProps } from "./DepartmentReportShared";
import styles from "./MarketReportBody.module.css";
import {
  buildMarketReportProduct,
  formatMarketMetric,
} from "./MarketReportProduct";

const marketDimensionLabels: Readonly<
  Record<string, { readonly en: string; readonly ko: string }>
> = {
  regime: { en: "Market regime", ko: "시장 국면" },
  relative_performance: { en: "Relative performance", ko: "상대 성과" },
  market_timing: { en: "Market timing", ko: "시장 타이밍" },
  timing: { en: "Entry timing", ko: "진입 타이밍" },
  catalyst: { en: "Catalyst", ko: "촉매" },
  leading_indicator: { en: "Leading indicator", ko: "선행 지표" },
};

function marketDimensionLabel(dimension: string, locale: Locale): string {
  return (
    marketDimensionLabels[dimension]?.[locale] ?? dimension.replaceAll("_", " ")
  );
}

function MetricIdentity({
  metricId,
  sourceId,
  period,
  locale,
}: {
  readonly metricId: string;
  readonly sourceId: string;
  readonly period: string;
  readonly locale: Locale;
}) {
  return (
    <small
      className={styles.identity}
      data-metric-id={metricId}
      data-source-id={sourceId}
      data-period={period}
    >
      {locale === "ko" ? `기준 ${period}` : `As of ${period}`}
    </small>
  );
}

export function MarketReportBrief(props: DepartmentReportBodyProps) {
  const { file, model, locale } = props;
  const ko = locale === "ko";
  const product = buildMarketReportProduct(file, model, locale);
  const regime =
    product.regimeClaims.length > 0
      ? product.regimeClaims
      : product.claims.slice(0, 3);
  return (
    <section
      className={`${styles.section} research-editorial-section research-department-section`}
      data-report-section="market-regime"
      data-department-layout="market"
      id="market-regime"
    >
      <header className={styles.chapter}>
        <span>MARKET / 01</span>
        <h2>{ko ? "국면·타이밍 보드" : "Regime & timing board"}</h2>
        <p>
          {ko
            ? "현재 신호가 어느 국면에 놓였는지, 무엇이 지속과 반전을 구분하는지 먼저 봅니다."
            : "Start with the regime, then separate persistent signals from reversal conditions."}
        </p>
      </header>

      {product.snapshot.length === 0 ? null : (
        <section
          className={styles.tape}
          data-market-landmark="market-tape"
          data-metric-count={Math.min(product.snapshot.length, 6)}
        >
          {product.snapshot.slice(0, 6).map((metric) => (
            <article key={metric.id}>
              <span>{metric.label[locale]}</span>
              <strong>{formatMarketMetric(metric, locale)}</strong>
              <MetricIdentity
                metricId={metric.id}
                period={metric.period}
                sourceId={metric.source}
                locale={locale}
              />
            </article>
          ))}
        </section>
      )}

      <section
        className={styles.quadrant}
        data-market-landmark="regime-quadrant"
      >
        <header>
          <span>{ko ? "핵심 판단 렌즈" : "Core decision lenses"}</span>
          <strong>{regime.length}</strong>
        </header>
        <div data-card-count={Math.min(regime.length, 6)}>
          {regime.slice(0, 6).map((claim, index) => (
            <article key={claim.id} data-contribution={claim.contribution}>
              <span>Q{index + 1}</span>
              <h3>{marketDimensionLabel(claim.dimension, locale)}</h3>
              <p>{claim.thesis}</p>
              {claim.falsifier.length === 0 ||
              claim.falsifier.trim() === claim.thesis.trim() ? null : (
                <small>{claim.falsifier}</small>
              )}
            </article>
          ))}
        </div>
      </section>

      {product.relativePerformance === undefined ? null : (
        <section
          className={styles.relative}
          data-market-landmark="relative-performance"
        >
          <header>
            <div>
              <span>{ko ? "상대 성과" : "Relative performance"}</span>
              <h3>
                {ko
                  ? `대상 vs ${product.relativePerformance.benchmark.row.name}`
                  : `Subject vs ${product.relativePerformance.benchmark.row.name}`}
              </h3>
            </div>
            <p>{product.relativePerformance.benchmark.row.rationale[locale]}</p>
          </header>
          <div>
            {product.relativePerformance.benchmark.points.map(
              ({ label, subject, peer }) => (
                <article key={subject.id} data-period={label}>
                  <span>{label}</span>
                  <div>
                    <strong>{formatMarketMetric(subject, locale)}</strong>
                    <i
                      style={
                        {
                          "--market-bar": `${Math.min(100, Math.max(4, Math.abs(subject.value)))}%`,
                        } as CSSProperties
                      }
                    />
                    <MetricIdentity
                      metricId={subject.id}
                      period={subject.period}
                      sourceId={subject.source}
                      locale={locale}
                    />
                  </div>
                  <div>
                    <strong>{peer.value}%</strong>
                    <i
                      style={
                        {
                          "--market-bar": `${Math.min(100, Math.max(4, Math.abs(peer.value)))}%`,
                        } as CSSProperties
                      }
                    />
                    <MetricIdentity
                      metricId={peer.key}
                      period={peer.period}
                      sourceId={peer.evidenceArtifactIds.join(",")}
                      locale={locale}
                    />
                  </div>
                </article>
              ),
            )}
          </div>
        </section>
      )}
    </section>
  );
}

export function MarketReportFramework(props: DepartmentReportBodyProps) {
  const { file, model, locale } = props;
  const ko = locale === "ko";
  const product = buildMarketReportProduct(file, model, locale);
  const confirmationClaims = product.claims.filter(
    (claim) =>
      claim.falsifier.trim().length > 0 &&
      claim.falsifier.trim() !== claim.thesis.trim(),
  );
  return (
    <section
      className={`${styles.section} research-editorial-section research-department-section`}
      data-report-section="market-timing"
      data-department-layout="market"
      id="market-timing"
    >
      <header className={styles.chapter}>
        <span>MARKET / 02</span>
        <h2>
          {ko
            ? "가격대·지속성·촉매 시계"
            : "Levels, persistence & catalyst clock"}
        </h2>
      </header>

      {product.ladder === undefined ? null : (
        <section
          className={styles.ladder}
          data-market-landmark="price-volume-ladder"
        >
          <header>
            <h3>{ko ? "지지·저항 사다리" : "Support-resistance ladder"}</h3>
            <div>
              <strong>
                {formatMarketMetric(product.ladder.volume, locale)}
              </strong>
              <span>{ko ? "거래량 기준" : "volume reference"}</span>
              <MetricIdentity
                metricId={product.ladder.volume.id}
                period={product.ladder.volume.period}
                sourceId={product.ladder.volume.source}
                locale={locale}
              />
            </div>
          </header>
          <ol>
            {product.ladder.levels.map((level) => (
              <li
                key={level.id}
                data-level={
                  level.id.startsWith("support") ? "support" : "resistance"
                }
              >
                <span>{level.label[locale]}</span>
                <strong>{formatMarketMetric(level, locale)}</strong>
                <MetricIdentity
                  metricId={level.id}
                  period={level.period}
                  sourceId={level.source}
                  locale={locale}
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      {confirmationClaims.length === 0 ? null : (
        <section
          className={styles.confirmation}
          data-market-landmark="confirmation-map"
        >
          <header>
            <span>{ko ? "확인 지도" : "Confirmation map"}</span>
            <h3>
              {ko
                ? "가격·수급 신호가 이 조건을 통과해야 판단이 바뀝니다"
                : "The call changes only when price and flow clear these tests"}
            </h3>
          </header>
          <ol>
            {confirmationClaims.slice(0, 6).map((claim, index) => (
              <li key={claim.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>
                    {marketDimensionLabel(claim.dimension, locale)}
                  </strong>
                  <p>{claim.falsifier}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className={styles.timingGrid}>
        {product.persistence === undefined ? null : (
          <section
            className={styles.persistence}
            data-market-landmark="signal-persistence"
          >
            <h3>{ko ? "신호 지속성" : "Signal persistence"}</h3>
            <ol>
              {product.persistence.map(({ label, point }) => (
                <li key={point.id}>
                  <span>{label}</span>
                  <strong>{formatMarketMetric(point, locale)}</strong>
                  <MetricIdentity
                    metricId={point.id}
                    period={point.period}
                    sourceId={point.source}
                    locale={locale}
                  />
                </li>
              ))}
            </ol>
          </section>
        )}
        {product.catalysts.length === 0 &&
        product.catalystWatch.length === 0 ? null : (
          <section
            className={styles.clock}
            data-market-landmark="catalyst-clock"
          >
            <h3>{ko ? "날짜가 있는 촉매" : "Dated catalyst clock"}</h3>
            <ol>
              {product.catalysts.map((item) => (
                <li key={item.id} data-source-id={item.sourceId}>
                  <time dateTime={item.date}>{item.date}</time>
                  <p>{item.thesis}</p>
                </li>
              ))}
              {product.catalysts.length === 0
                ? product.catalystWatch.slice(0, 2).map((item) => (
                    <li key={item.id}>
                      <time>{ko ? "상시 관찰" : "ACTIVE WATCH"}</time>
                      <p>{item.thesis}</p>
                    </li>
                  ))
                : null}
            </ol>
          </section>
        )}
      </div>
    </section>
  );
}

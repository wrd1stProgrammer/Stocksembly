import type { Locale } from "../../../lib/i18n";
import type {
  EditorialDecisionPath,
  EditorialEvidenceBalance,
  EditorialVisualMetric,
} from "../../../research/researchFileEditorialModel";

export function ResearchMetricStrip({
  metrics,
  locale,
}: {
  readonly metrics: readonly EditorialVisualMetric[];
  readonly locale: Locale;
  readonly emptyLabel?: string;
}) {
  if (metrics.length === 0) return null;
  return (
    <dl
      className="research-metric-strip"
      aria-label={
        locale === "ko" ? "검증된 수치 지표" : "Verified numeric metrics"
      }
    >
      {metrics.map((metric) => (
        <div key={metric.id} data-signal={metric.signal}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
          {metric.barPercent === undefined ? null : (
            <span
              className="research-metric-strip__bar"
              aria-label={`${metric.label} ${metric.value}`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={metric.barPercent}
              role="progressbar"
            >
              <i style={{ width: `${metric.barPercent}%` }} />
            </span>
          )}
        </div>
      ))}
    </dl>
  );
}

export function ResearchEvidenceBalance({
  balance,
  locale,
}: {
  readonly balance: EditorialEvidenceBalance;
  readonly locale: Locale;
}) {
  if (balance.total === 0) return null;
  return (
    <section className="research-evidence-balance">
      <header>
        <div>
          <span>{locale === "ko" ? "주장 검증 분포" : "Claim audit mix"}</span>
          <strong>
            {balance.total}
            <small>
              {locale === "ko" ? "개 핵심 주장" : " material claims"}
            </small>
          </strong>
        </div>
        <p>
          {locale === "ko"
            ? "확인·부분 확인·상충·미확인 비중입니다."
            : "Supported, partial, challenged, and unverified claims."}
        </p>
      </header>
      <div
        className="research-evidence-balance__bar"
        role="img"
        aria-label={balance.segments
          .map((segment) => `${segment.label} ${segment.count}`)
          .join(", ")}
      >
        {balance.segments.map((segment) =>
          segment.count === 0 ? null : (
            <span
              key={segment.id}
              data-balance={segment.id}
              style={{ width: `${segment.percent}%` }}
            />
          ),
        )}
      </div>
      <dl>
        {balance.segments.map((segment) => (
          <div key={segment.id}>
            <dt>
              <i data-balance={segment.id} />
              {segment.label}
            </dt>
            <dd>
              {segment.count}
              <small>{segment.percent}%</small>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ResearchDecisionPathBoard({
  paths,
  locale,
}: {
  readonly paths: readonly EditorialDecisionPath[];
  readonly locale: Locale;
}) {
  if (paths.length === 0) return null;
  return (
    <section className="research-decision-paths">
      <header>
        <span>{locale === "ko" ? "판단 경로" : "Decision paths"}</span>
        <p>
          {locale === "ko"
            ? "예측 확률을 꾸며내지 않고, 어떤 관찰이 결론을 강화하거나 깨는지 구분합니다."
            : "No invented probabilities: each path states what would reinforce or break the view."}
        </p>
      </header>
      <div>
        {paths.map((path, index) => (
          <article
            key={path.id}
            data-path={path.id}
            data-cockpit-next-event={
              path.id === "challenge" ? "true" : undefined
            }
            data-cockpit-falsifier={
              path.id === "invalidate" ? "true" : undefined
            }
          >
            <b>{String(index + 1).padStart(2, "0")}</b>
            <span>{path.label}</span>
            <h3>{path.headline}</h3>
            {path.detail.trim() === path.headline.trim() ? null : (
              <p>{path.detail}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function ResearchSegmentMix({
  metrics,
  locale,
}: {
  readonly metrics: readonly EditorialVisualMetric[];
  readonly locale: Locale;
}) {
  const segments = metrics.filter(
    (metric) =>
      metric.id.startsWith("segment_share:") ||
      metric.id.startsWith("region_share:"),
  );
  if (segments.length === 0) return null;
  return (
    <section
      className="research-segment-mix"
      aria-label={locale === "ko" ? "매출 구성 차트" : "Revenue mix chart"}
    >
      <header>
        <span>{locale === "ko" ? "매출 구성" : "Revenue mix"}</span>
        <p>
          {locale === "ko"
            ? "공시된 최신 구성비"
            : "Latest disclosed composition"}
        </p>
      </header>
      <div>
        {segments.map((segment) => (
          <article key={segment.id}>
            <div>
              <strong>{segment.label}</strong>
              <span>{segment.value}</span>
            </div>
            <i
              aria-label={`${segment.label} ${segment.value}`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={segment.barPercent ?? 0}
              role="progressbar"
            >
              <b
                style={{
                  width: `${Math.max(0, Math.min(100, segment.barPercent ?? 0))}%`,
                }}
              />
            </i>
          </article>
        ))}
      </div>
    </section>
  );
}

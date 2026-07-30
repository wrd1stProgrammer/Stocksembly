import type { Locale } from "../../../lib/i18n";
import type {
  EditorialDecisionPath,
  EditorialEvidenceBalance,
  EditorialVisualMetric,
} from "../../../research/researchFileEditorialModel";

export function ResearchMetricStrip({
  metrics,
  locale,
  emptyLabel,
}: {
  readonly metrics: readonly EditorialVisualMetric[];
  readonly locale: Locale;
  readonly emptyLabel?: string;
}) {
  if (metrics.length === 0)
    return (
      <p className="research-visual-empty">
        {emptyLabel ??
          (locale === "ko"
            ? "이번 근거 묶음에서 숫자로 확인된 지표는 별도 표기하지 않습니다."
            : "No decision-grade numeric metric is displayed for this evidence set.")}
      </p>
    );
  return (
    <dl className="research-metric-strip" aria-label="Verified numeric metrics">
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
            ? "단일 점수 대신 확인·부분 확인·상충·미확인 비중을 그대로 보여줍니다."
            : "The mix is shown directly instead of compressing every claim into one score."}
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
        {paths.map((path) => (
          <article key={path.id} data-path={path.id}>
            <span>{path.label}</span>
            <h3>{path.headline}</h3>
            <p>{path.detail}</p>
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
    <section className="research-segment-mix">
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
            <i>
              <b style={{ width: `${segment.barPercent ?? 0}%` }} />
            </i>
          </article>
        ))}
      </div>
    </section>
  );
}

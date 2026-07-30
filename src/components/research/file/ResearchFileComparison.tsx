import type { Locale } from "../../../lib/i18n";
import type { ResearchComparison } from "../../../research/domain/researchComparison";
import { ResearchFileSectionHeader } from "./ResearchFilePrimitives";

const directionCopy = {
  strengthened: { en: "Strengthened", ko: "강화" },
  weakened: { en: "Weakened", ko: "약화" },
  changed: { en: "Changed", ko: "변경" },
  unchanged: { en: "Still valid", ko: "유지" },
} as const;

const kindCopy = {
  added: { en: "New", ko: "신규" },
  removed: { en: "Removed", ko: "제외" },
  strengthened: { en: "Stronger", ko: "강화" },
  weakened: { en: "Weaker", ko: "약화" },
  updated: { en: "Updated", ko: "수정" },
} as const;

const metricCopy = {
  sources: { en: "Linked sources", ko: "연결 출처" },
  material_claims: { en: "Material claims", ko: "핵심 주장" },
  evidence_confidence: { en: "Evidence confidence", ko: "근거 통과율" },
} as const;

export function ResearchFileComparison({
  comparison,
  locale,
}: {
  readonly comparison: ResearchComparison;
  readonly locale: Locale;
}) {
  const ko = locale === "ko";
  const date = (value: string) =>
    new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(value));
  const formatValue = (
    value: number,
    unit: ResearchComparison["dataChanges"][number]["unit"],
  ) => {
    if (unit === "percent")
      return `${value.toLocaleString(ko ? "ko-KR" : "en-US", {
        maximumFractionDigits: 1,
      })}%`;
    if (unit === "multiple")
      return `${value.toLocaleString(ko ? "ko-KR" : "en-US", {
        maximumFractionDigits: 1,
      })}x`;
    if (unit === "count")
      return value.toLocaleString(ko ? "ko-KR" : "en-US", {
        maximumFractionDigits: 0,
      });
    if (unit === "USD_per_share")
      return `$${value.toLocaleString(ko ? "ko-KR" : "en-US", {
        maximumFractionDigits: 2,
      })}`;
    return new Intl.NumberFormat(ko ? "ko-KR" : "en-US", {
      notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
      maximumFractionDigits: 1,
      ...(unit === "USD" ? { style: "currency", currency: "USD" } : {}),
    }).format(value);
  };
  return (
    <section
      className="research-editorial-section research-change-page"
      data-report-section="comparison"
      id="research-changes"
    >
      <ResearchFileSectionHeader
        number="∆"
        title={
          ko
            ? "지난 분석 이후 달라진 점"
            : "What changed since the last analysis"
        }
        description={
          ko
            ? `${date(comparison.baselinePublishedAt)} 분석과 같은 리서치 방식으로 다시 비교했습니다.`
            : `Compared with the ${date(comparison.baselinePublishedAt)} report using the same research mode.`
        }
      />
      <div
        className="research-change-conclusion"
        data-direction={comparison.conclusion.direction}
      >
        <div>
          <span>{ko ? "이전 결론" : "Previous conclusion"}</span>
          <p>{comparison.conclusion.previous[locale]}</p>
        </div>
        <strong>
          {directionCopy[comparison.conclusion.direction][locale]}
        </strong>
        <div>
          <span>{ko ? "현재 결론" : "Current conclusion"}</span>
          <p>{comparison.conclusion.current[locale]}</p>
        </div>
      </div>
      {comparison.dataChanges.length === 0 ? null : (
        <section className="research-data-change-board">
          <header>
            <div>
              <span>DATA DELTA</span>
              <h3>
                {ko ? "투자 판단을 움직인 숫자" : "Numbers that moved the view"}
              </h3>
            </div>
            <p>
              {ko
                ? "같은 지표의 이전·현재 값을 비교하고 투자 논지에 미친 영향을 연결했습니다."
                : "The same metrics are compared across reports and connected to their investment impact."}
            </p>
          </header>
          <div className="research-data-change-grid">
            {comparison.dataChanges.map((change) => (
              <article key={change.id} data-direction={change.direction}>
                <div className="research-data-change-grid__heading">
                  <span>{change.category.toUpperCase()}</span>
                  <strong>{change.label[locale]}</strong>
                </div>
                <div className="research-data-change-grid__values">
                  <span>{formatValue(change.previous, change.unit)}</span>
                  <i aria-hidden="true">→</i>
                  <b>{formatValue(change.current, change.unit)}</b>
                  <em>
                    {change.delta > 0 ? "+" : ""}
                    {change.unit === "percent"
                      ? `${change.delta.toFixed(1)}%p`
                      : change.deltaPercent === null
                        ? formatValue(change.delta, change.unit)
                        : `${change.deltaPercent.toFixed(1)}%`}
                  </em>
                </div>
                <p>{change.impact[locale]}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      <dl className="research-change-metrics">
        {comparison.metrics.map((metric) => (
          <div key={metric.id}>
            <dt>{metricCopy[metric.id][locale]}</dt>
            <dd>
              <strong>
                {metric.current}
                {metric.unit === "percent" ? "%" : ""}
              </strong>
              <span data-positive={metric.delta > 0 || undefined}>
                {metric.delta > 0 ? "+" : ""}
                {metric.delta}
                {metric.unit === "percent" ? "%p" : ""}
              </span>
            </dd>
            <small>
              {ko ? "이전" : "previous"} {metric.previous}
              {metric.unit === "percent" ? "%" : ""}
            </small>
          </div>
        ))}
      </dl>
      <section className="research-change-list">
        <h3>{ko ? "중요 변화" : "Material changes"}</h3>
        {comparison.noMaterialChange ? (
          <article className="research-change-list__stable">
            <strong>
              {ko ? "핵심 결론 유지" : "Core conclusion retained"}
            </strong>
            <p>
              {ko
                ? "새 근거를 다시 검토했지만 핵심 투자 논지를 뒤집을 만한 변화는 확인되지 않았습니다."
                : "New evidence was reviewed, but no change was material enough to overturn the core thesis."}
            </p>
          </article>
        ) : (
          comparison.materialChanges.map((change) => (
            <article key={change.id} data-kind={change.kind}>
              <span>{kindCopy[change.kind][locale]}</span>
              <div>
                <h4>{change.title[locale]}</h4>
                <p>{change.detail[locale]}</p>
              </div>
              <small>
                {change.sourceIds.length} {ko ? "개 출처" : "sources"}
              </small>
            </article>
          ))
        )}
      </section>
      <aside className="research-change-next">
        <strong>
          {ko ? "다음 판단 변경 조건" : "Next condition that changes the view"}
        </strong>
        <p>{comparison.nextCondition[locale]}</p>
      </aside>
    </section>
  );
}

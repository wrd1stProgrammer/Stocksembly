import { DownloadSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { Locale } from "../../../lib/i18n";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";

function sourceClassLabel(sourceClass: string, locale: Locale): string {
  const labels: Readonly<
    Record<string, { readonly en: string; readonly ko: string }>
  > = {
    insightsentry_rapidapi: {
      en: "Market evidence",
      ko: "시장 근거",
    },
    sec_primary_filing: { en: "SEC filing", ko: "SEC 공시" },
    sec_company_facts: { en: "SEC XBRL", ko: "SEC XBRL" },
    treasury_yield: { en: "Official macro data", ko: "공식 거시 데이터" },
  };
  return labels[sourceClass]?.[locale] ?? sourceClass.replaceAll("_", " ");
}

function sourceDate(observedAt: string | undefined, locale: Locale): string {
  if (observedAt === undefined)
    return locale === "ko" ? "기준일 미표기" : "Undated";
  const date = new Date(observedAt);
  if (Number.isNaN(date.getTime())) return observedAt;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function freshnessLabel(freshness: string | undefined, locale: Locale): string {
  const labels: Readonly<
    Record<string, { readonly en: string; readonly ko: string }>
  > = {
    current: { en: "Current", ko: "최신" },
    stale: { en: "Needs refresh", ko: "갱신 필요" },
    unavailable: { en: "Not dated", ko: "기준일 없음" },
  };
  if (freshness === undefined)
    return locale === "ko" ? "기준일 확인" : "Check date";
  return labels[freshness]?.[locale] ?? freshness.replaceAll("_", " ");
}

export function ResearchFileSources({
  model,
  locale,
  version,
  reportId,
  onReplay,
  collapsed = false,
}: {
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
  readonly version: number;
  readonly reportId?: string;
  readonly onReplay: () => void;
  readonly collapsed?: boolean;
}) {
  const ko = locale === "ko";
  const populatedGroups = model.sourceGroups.filter(
    (group) => group.sources.length > 0,
  );

  return (
    <section
      className="research-editorial-section research-source-register"
      data-report-section="sources"
      id="source-register"
    >
      <SourceDisclosure
        collapsed={collapsed}
        summary={
          ko
            ? `${model.evidenceIndex.length}개 출처 보기`
            : `Show ${model.evidenceIndex.length} sources`
        }
      >
        <header className="research-source-register__header">
          <div>
            <span>{ko ? "출처 부록" : "Source appendix"}</span>
            <h2>{ko ? "출처·근거 등록부" : "Sources & evidence register"}</h2>
            <p>
              {ko
                ? "각 장의 판단에 실제로 연결된 자료를 발행처, 기준일, 자료 유형과 함께 정리했습니다."
                : "Sources are grouped by the report chapter they support, with publisher, observation date, and evidence class."}
            </p>
          </div>
          <strong>
            {ko
              ? `${model.evidenceIndex.length}개 출처 · ${populatedGroups.length}개 장`
              : `${model.evidenceIndex.length} sources · ${populatedGroups.length} chapters`}
          </strong>
        </header>

        <div className="research-source-groups">
          {populatedGroups.map((group) => (
            <section className="research-source-group" key={group.number}>
              <header>
                <span>{group.number}</span>
                <div>
                  <h3>{group.title}</h3>
                  <p>{group.purpose}</p>
                </div>
                <strong>
                  {ko
                    ? `${group.sources.length}개 근거`
                    : `${group.sources.length} sources`}
                </strong>
              </header>
              <div className="research-source-table">
                <div className="research-source-table__head" aria-hidden="true">
                  <span>ID</span>
                  <span>{ko ? "발행처" : "Publisher"}</span>
                  <span>{ko ? "자료·연결" : "Source & link"}</span>
                  <span>{ko ? "기준일" : "Observed"}</span>
                  <span>{ko ? "유형·상태" : "Class & status"}</span>
                </div>
                <ol>
                  {group.sources.map((source) => (
                    <li key={`${group.number}-${source.id}`}>
                      <strong title={source.id}>{source.id.slice(0, 8)}</strong>
                      <span>{source.publisher}</span>
                      <p>
                        {source.url === undefined ? (
                          source.title
                        ) : (
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.title}
                          </a>
                        )}
                      </p>
                      <time dateTime={source.observedAt}>
                        {sourceDate(source.observedAt, locale)}
                      </time>
                      <em>
                        {sourceClassLabel(source.sourceClass, locale)}
                        <small>
                          {freshnessLabel(source.freshness, locale)}
                        </small>
                      </em>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ))}
        </div>

        <aside className="research-source-register__method">
          <strong>{ko ? "읽는 법" : "How to read this register"}</strong>
          <p>
            {ko
              ? "동일한 출처가 여러 장의 판단에 사용된 경우 각 장에 반복 표기합니다. 발행처 자료는 사실 근거이며, 최종 해석과 판단은 에이전트 팀의 종합 결과입니다."
              : "A source appears in every chapter where it was used. Publisher material is treated as evidence; interpretation and final judgment remain the agent team's synthesis."}
          </p>
        </aside>
      </SourceDisclosure>

      <footer className="completed-research-file__footer">
        <p>
          {ko
            ? `Research File v${version}.0 · 이 파일은 투자 권유나 목표가가 아닌 근거와 판단 조건의 기록입니다.`
            : `Research File v${version}.0 · This file records evidence and decision conditions; it is not a recommendation or price target.`}
        </p>
        <div>
          {reportId === undefined ? null : (
            <a
              href={`/api/research/reports/${reportId}/pdf?lang=${locale}`}
              onClick={(event) => {
                event.preventDefault();
                window.print();
              }}
            >
              <DownloadSimple size={17} aria-hidden="true" />
              {ko ? "PDF로 저장" : "Download PDF"}
            </a>
          )}
          <button type="button" onClick={onReplay}>
            {ko ? "리서치 룸 다시 보기" : "Replay research room"}
          </button>
        </div>
      </footer>
    </section>
  );
}

function SourceDisclosure({
  collapsed,
  summary,
  children,
}: {
  readonly collapsed: boolean;
  readonly summary: string;
  readonly children: ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <details data-committee-sources>
      <summary>{summary}</summary>
      <div className="research-source-register__collapsible">{children}</div>
    </details>
  );
}

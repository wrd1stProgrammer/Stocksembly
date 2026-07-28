"use client";

import {
  CalendarDots,
  ClockCounterClockwise,
  Database,
  DownloadSimple,
  LinkSimple,
  Scales,
  ShieldCheck,
  WarningDiamond,
} from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import type { Locale } from "../../lib/i18n";
import type {
  LocalizedText,
  ResearchFileData,
} from "../../research/compositions/types";
import type { ResearchCompany } from "../../research/types";

type Props = {
  readonly company: ResearchCompany;
  readonly locale: Locale;
  readonly report: ResearchFileData;
  readonly version: number;
  readonly reportId?: string;
  readonly onReplay: () => void;
};

function localized(value: LocalizedText, locale: Locale): string {
  return value[locale];
}

const voteLabels = {
  support: { en: "Supports", ko: "지지" },
  support_with_reservations: {
    en: "Supports with reservations",
    ko: "조건부 지지",
  },
  oppose: { en: "Opposes", ko: "반대" },
  abstain: { en: "Abstains", ko: "유보" },
} as const;

export function LegacyCompletedResearchFile({
  company,
  locale,
  report,
  version,
  reportId,
  onReplay,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const ko = locale === "ko";

  useEffect(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
    )
      return;
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      className="completed-research-file"
      aria-labelledby="research-file-title"
    >
      <article className="research-file-document">
        <header className="research-file-cover" data-report-section="cover">
          <div className="research-file-cover__masthead">
            <span>SERN / STOCKSEMBLY</span>
            <span>
              {ko
                ? "근거 감사 기업 리서치"
                : "EVIDENCE-AUDITED EQUITY RESEARCH"}
            </span>
          </div>
          <div className="research-file-cover__hero">
            <div>
              <span>
                {company.exchange} · {company.sector}
              </span>
              <h1 id="research-file-title" ref={titleRef} tabIndex={-1}>
                {company.symbol}
              </h1>
              <p>{company.company}</p>
              <h2>{localized(report.thesis, locale)}</h2>
            </div>
            <aside data-posture={report.posture}>
              <span>{ko ? "위원회 근거 판단" : "COMMITTEE EVIDENCE VIEW"}</span>
              <strong>{localized(report.postureLabel, locale)}</strong>
              <p>{localized(report.limitationNote, locale)}</p>
              <div>
                <ShieldCheck size={18} weight="fill" aria-hidden="true" />
                {report.evidenceScore.passed}/{report.evidenceScore.denominator}{" "}
                {ko ? "감사 통과" : "checks passed"}
              </div>
            </aside>
          </div>
          <dl className="research-file-cover__metrics">
            <div>
              <dt>{ko ? "리서치 버전" : "RESEARCH VERSION"}</dt>
              <dd>v{version}.0</dd>
            </div>
            <div>
              <dt>{ko ? "감사 주장" : "AUDITED CLAIMS"}</dt>
              <dd>{report.claimCount}</dd>
            </div>
            <div>
              <dt>{ko ? "연결 출처" : "LINKED SOURCES"}</dt>
              <dd>{report.sourceCount}</dd>
            </div>
            <div>
              <dt>{ko ? "기준 시각" : "AS OF"}</dt>
              <dd>{localized(report.asOf, locale)}</dd>
            </div>
          </dl>
        </header>

        <nav
          className="research-file-index"
          aria-label={ko ? "리서치 파일 섹션" : "Research file sections"}
        >
          <a href="#decision-brief">{ko ? "판단 요약" : "Decision brief"}</a>
          <a href="#evidence-analysis">{ko ? "핵심 분석" : "Core analysis"}</a>
          <a href="#decision-scenarios">{ko ? "시나리오" : "Scenarios"}</a>
          <a href="#team-debate">{ko ? "팀 토론" : "Team debate"}</a>
          <a href="#evidence-register">
            {ko ? "근거 등록부" : "Evidence register"}
          </a>
        </nav>

        <section
          className="research-file-section research-file-decision"
          data-report-section="decision"
          id="decision-brief"
        >
          <header className="research-file-section__header">
            <span>01</span>
            <div>
              <small>{ko ? "10초 결론" : "TEN-SECOND BRIEF"}</small>
              <h2>{localized(report.condition, locale)}</h2>
            </div>
          </header>
          {report.researchDirection === undefined ? null : (
            <aside className="research-file-mandate">
              <span>{ko ? "사용자 조사 방향" : "RESEARCH MANDATE"}</span>
              <p>“{report.researchDirection}”</p>
            </aside>
          )}
          <div className="research-file-decision__facts">
            <article>
              <span>{ko ? "가격에 반영된 기대" : "Priced expectations"}</span>
              <p>{localized(report.expectation, locale)}</p>
            </article>
            <article>
              <span>{ko ? "밸류에이션 판단" : "Valuation posture"}</span>
              <p>{localized(report.valuation, locale)}</p>
            </article>
            <article>
              <CalendarDots size={18} aria-hidden="true" />
              <span>{ko ? "다음 검증 이벤트" : "Next confirming event"}</span>
              <p>{localized(report.nextEvent, locale)}</p>
            </article>
            <article>
              <Database size={18} aria-hidden="true" />
              <span>{ko ? "데이터 최신성" : "Data freshness"}</span>
              <p>{localized(report.freshness, locale)}</p>
            </article>
          </div>
          {report.qualityScorecard === undefined ? null : (
            <section
              className="research-file-quality"
              aria-label={ko ? "리서치 품질 점검" : "Research quality checks"}
            >
              {[
                {
                  label: ko ? "근거 충족" : "Evidence coverage",
                  value: report.qualityScorecard.evidenceCoverage,
                },
                {
                  label: ko ? "최신성" : "Freshness",
                  value: report.qualityScorecard.freshnessCoverage,
                },
                {
                  label: ko ? "반론 해소" : "Rebuttal resolution",
                  value: report.qualityScorecard.rebuttalResolution,
                },
              ].map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}%</strong>
                  <progress
                    aria-label={metric.label}
                    max={100}
                    value={metric.value}
                  />
                </div>
              ))}
            </section>
          )}
          <div className="research-file-thesis-split">
            <article data-tone="positive">
              <h3>{ko ? "확인된 강점" : "Core positives"}</h3>
              <ol>
                {report.positives.map((item) => (
                  <li key={item.en}>{localized(item, locale)}</li>
                ))}
              </ol>
            </article>
            <article data-tone="concern">
              <h3>{ko ? "남은 우려" : "Core concerns"}</h3>
              <ol>
                {report.concerns.map((item) => (
                  <li key={item.en}>{localized(item, locale)}</li>
                ))}
              </ol>
            </article>
          </div>
          <aside className="research-file-change">
            <WarningDiamond size={20} aria-hidden="true" />
            <div>
              <strong>
                {ko ? "판단이 달라질 조건" : "What would change the judgment"}
              </strong>
              <p>{localized(report.changeCondition, locale)}</p>
            </div>
          </aside>
        </section>

        <section
          className="research-file-section"
          data-report-section="analysis"
          id="evidence-analysis"
        >
          <header className="research-file-section__header">
            <span>02</span>
            <div>
              <small>{ko ? "핵심 분석" : "CORE ANALYSIS"}</small>
              <h2>
                {ko
                  ? "헤드라인 뒤의 근거를 읽습니다"
                  : "The evidence behind the headline"}
              </h2>
            </div>
          </header>
          <div className="research-file-analysis-ledger">
            {report.analysis.map((item, index) => (
              <article key={item.title.en}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{localized(item.title, locale)}</h3>
                <strong>{localized(item.summary, locale)}</strong>
                <p>{localized(item.detail, locale)}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="research-file-section"
          data-report-section="scenarios"
          id="decision-scenarios"
        >
          <header className="research-file-section__header">
            <span>03</span>
            <div>
              <small>{ko ? "판단 변수" : "DECISION DRIVERS"}</small>
              <h2>
                {ko ? "무엇이 판단을 바꾸는가" : "Decision drivers & scenarios"}
              </h2>
            </div>
          </header>
          <div className="research-file-scenario-bands">
            {report.scenarios.map((scenario) => (
              <article key={scenario.id} data-scenario={scenario.id}>
                <header>
                  <span>{scenario.probability}</span>
                  <strong>{localized(scenario.label, locale)}</strong>
                </header>
                <p>{localized(scenario.thesis, locale)}</p>
                <ul>
                  {scenario.assumptions.map((assumption) => (
                    <li
                      key={
                        assumption.kind === "metric"
                          ? `${assumption.metric.en}-${assumption.displayValue.en}`
                          : assumption.note.en
                      }
                    >
                      {assumption.kind === "metric"
                        ? `${localized(assumption.metric, locale)} ${localized(assumption.displayValue, locale)}`
                        : localized(assumption.note, locale)}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section
          className="research-file-section"
          data-report-section="debate"
          id="team-debate"
        >
          <header className="research-file-section__header">
            <span>04</span>
            <div>
              <small>{ko ? "독립 팀 토론" : "INDEPENDENT TEAM DEBATE"}</small>
              <h2>
                {ko
                  ? "같은 결론을 복창하지 않았습니다"
                  : "Team debate & evidence audit"}
              </h2>
            </div>
          </header>
          <div className="research-file-team-ledger">
            {report.teamViews.map((team, index) => (
              <article key={team.departmentId}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{localized(team.teamName, locale)}</h3>
                  <strong>{localized(team.position, locale)}</strong>
                  <p>{localized(team.rationale, locale)}</p>
                </div>
                <em data-vote={team.vote}>
                  {localized(voteLabels[team.vote], locale)}
                </em>
              </article>
            ))}
          </div>
        </section>

        <section
          className="research-file-section research-file-evidence"
          data-report-section="evidence"
          id="evidence-register"
        >
          <header className="research-file-section__header">
            <span>05</span>
            <div>
              <small>{ko ? "감사 기록" : "AUDIT TRAIL"}</small>
              <h2>
                {ko
                  ? "주장과 출처를 연결합니다"
                  : "Audited evidence and dissent"}
              </h2>
            </div>
          </header>
          {report.claimMatrix === undefined ? null : (
            <table className="research-file-claim-ledger">
              <tbody>
                {report.claimMatrix.map((item, index) => (
                  <tr key={item.claim.en}>
                    <td>C{String(index + 1).padStart(2, "0")}</td>
                    <td>{localized(item.claim, locale)}</td>
                    <td>
                      <em data-verdict={item.verdict}>
                        {item.verdict.replaceAll("_", " ")}
                      </em>
                    </td>
                    <td>
                      <strong>
                        <LinkSimple size={14} aria-hidden="true" />
                        {item.sourceCount}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="research-file-appendix">
            {report.appendix.map((section) => (
              <article key={section.title.en}>
                <h3>{localized(section.title, locale)}</h3>
                <ul>
                  {section.items.map((item) => (
                    <li key={item.en}>{localized(item, locale)}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="research-file-method">
            <Scales size={22} aria-hidden="true" />
            <p>
              {ko
                ? "11명의 전문 에이전트는 독립 조사, 부서 합의, 교차 반론, 구조 감사와 의미 감사를 순서대로 통과했습니다."
                : "Eleven specialists researched independently, consolidated by department, challenged one another, and passed structural and semantic audits."}
            </p>
          </div>
          <div className="research-file-version-block">
            <ClockCounterClockwise size={18} aria-hidden="true" />
            <ol className="research-file-version-list">
              {report.versions.map((item) => (
                <li key={item.version}>
                  <time>{item.date}</time>
                  <strong>{item.version}</strong>
                  <span>{localized(item.label, locale)}</span>
                </li>
              ))}
              {version > 1 ? (
                <li>
                  <time>{ko ? "현재" : "Current"}</time>
                  <strong>v{version}.0</strong>
                  <span>
                    {ko ? "추가 조사 업데이트" : "Follow-up research update"}
                  </span>
                </li>
              ) : null}
            </ol>
          </div>
          <footer className="completed-research-file__footer">
            <p>
              {ko
                ? "이 파일은 투자 권유나 목표가가 아닌, 근거와 판단 조건을 정리한 조사 기록입니다."
                : "This file records evidence and decision conditions; it is not a recommendation or price target."}
            </p>
            <div>
              {reportId ? (
                <a
                  href={`/api/research/reports/${reportId}/pdf?lang=${locale}`}
                  download
                >
                  <DownloadSimple size={17} aria-hidden="true" />
                  {ko ? "PDF 다운로드" : "Download PDF"}
                </a>
              ) : null}
              <button type="button" onClick={onReplay}>
                {ko ? "리서치 룸 다시 보기" : "Replay research room"}
              </button>
            </div>
          </footer>
        </section>
      </article>
    </section>
  );
}

export { CompletedResearchFileV2 as CompletedResearchFile } from "./CompletedResearchFileV2";

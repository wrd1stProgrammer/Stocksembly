import {
  ArrowLeft,
  CalendarDots,
  CheckCircle,
  ClockCounterClockwise,
  Database,
  Scales,
  ShieldCheck,
  WarningDiamond,
} from "@phosphor-icons/react";
import type { Locale } from "../../lib/i18n";
import type {
  LocalizedText,
  ResearchFileData,
  ResearchSource,
} from "../../research/compositions/types";
import type { ResearchCompany } from "../../research/types";
import { ResearchReportSources } from "./ResearchReportSources";

type Props = {
  readonly company: ResearchCompany;
  readonly locale: Locale;
  readonly report: ResearchFileData;
  readonly sources: readonly ResearchSource[];
  readonly onBack: () => void;
};

function copy(value: LocalizedText, locale: Locale): string {
  return value[locale];
}

export function ResearchReport({
  company,
  locale,
  report,
  sources,
  onBack,
}: Props) {
  const ko = locale === "ko";
  return (
    <main className="research-report" lang={locale}>
      <header className="report-command">
        <button type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          {ko ? "리서치 룸" : "Research room"}
        </button>
        <div>
          <span>{ko ? "리서치 파일" : "RESEARCH FILE"}</span>
          <strong>
            {company.symbol} · {report.versions.at(-1)?.version ?? "v1.0"}
          </strong>
        </div>
        <p>{copy(report.asOf, locale)}</p>
      </header>

      <section className="report-identity">
        <div>
          <span>
            {company.exchange} · {company.sector}
          </span>
          <h1>{company.company}</h1>
          <p>
            {company.symbol} · {company.price} <strong>{company.change}</strong>
          </p>
        </div>
        <aside>
          <ShieldCheck size={22} weight="fill" />
          <span>{ko ? "근거 감사 완료" : "Evidence audit complete"}</span>
          <strong>
            {report.evidenceScore.passed} / {report.evidenceScore.denominator}
          </strong>
        </aside>
      </section>

      <nav
        className="report-index"
        aria-label={ko ? "리포트 목차" : "Report sections"}
      >
        <a href="#brief">01 {ko ? "10초 요약" : "Ten-second brief"}</a>
        <a href="#analysis">02 {ko ? "본문 분석" : "Analysis"}</a>
        <a href="#appendix">03 {ko ? "근거·토론 부록" : "Evidence & debate"}</a>
        <a href="#versions">04 {ko ? "버전 기록" : "Version history"}</a>
      </nav>

      <section className="report-brief" id="brief">
        <header>
          <div>
            <span>01 · {ko ? "10초 요약" : "TEN-SECOND BRIEF"}</span>
            <h2>{copy(report.thesis, locale)}</h2>
          </div>
          <strong>{copy(report.condition, locale)}</strong>
        </header>
        <div className="report-brief__facts">
          <article>
            <span>{ko ? "가격에 반영된 기대" : "Priced expectations"}</span>
            <p>{copy(report.expectation, locale)}</p>
          </article>
          <article>
            <span>{ko ? "밸류에이션" : "Valuation"}</span>
            <p>{copy(report.valuation, locale)}</p>
          </article>
          <article>
            <CalendarDots size={18} />
            <span>{ko ? "다음 중요 이벤트" : "Next material event"}</span>
            <p>{copy(report.nextEvent, locale)}</p>
          </article>
          <article>
            <Database size={18} />
            <span>{ko ? "데이터 신선도" : "Data freshness"}</span>
            <p>{copy(report.freshness, locale)}</p>
          </article>
        </div>
        <div className="report-points">
          <article className="is-positive">
            <h3>{ko ? "핵심 긍정" : "Core positives"}</h3>
            <ol>
              {report.positives.map((item) => (
                <li key={item.en}>{copy(item, locale)}</li>
              ))}
            </ol>
          </article>
          <article className="is-concern">
            <h3>{ko ? "핵심 우려" : "Core concerns"}</h3>
            <ol>
              {report.concerns.map((item) => (
                <li key={item.en}>{copy(item, locale)}</li>
              ))}
            </ol>
          </article>
        </div>
        <aside className="report-change-condition">
          <WarningDiamond size={20} />
          <div>
            <strong>
              {ko ? "판단이 달라질 조건" : "What would change the judgment"}
            </strong>
            <p>{copy(report.changeCondition, locale)}</p>
          </div>
        </aside>
      </section>

      <section className="report-analysis" id="analysis">
        <header>
          <span>02 · {ko ? "본문 분석" : "ANALYSIS"}</span>
          <h2>
            {ko
              ? "기대와 현실을 분리해서 봅니다"
              : "Separate operating reality from market expectations"}
          </h2>
        </header>
        <div className="report-analysis__grid">
          {report.analysis.map((item, index) => (
            <article key={item.title.en}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{copy(item.title, locale)}</h3>
              <strong>{copy(item.summary, locale)}</strong>
              <p>{copy(item.detail, locale)}</p>
            </article>
          ))}
        </div>
        <section className="report-scenarios">
          <header>
            <Scales size={20} />
            <div>
              <span>
                {ko ? "시나리오와 계산 가정" : "SCENARIOS & ASSUMPTIONS"}
              </span>
              <small>
                {ko
                  ? "목표가 또는 투자 권유가 아닙니다"
                  : "Not a price target or recommendation"}
              </small>
            </div>
          </header>
          <div>
            {report.scenarios.map((scenario) => (
              <article key={scenario.id} data-scenario={scenario.id}>
                <header>
                  <strong>{copy(scenario.label, locale)}</strong>
                  <span>{scenario.probability}</span>
                </header>
                <p>{copy(scenario.thesis, locale)}</p>
                <dl>
                  {scenario.assumptions.map((assumption, index) => {
                    const label =
                      assumption.kind === "metric"
                        ? copy(assumption.metric, locale)
                        : ko
                          ? "검증 상태"
                          : "Validation";
                    const value =
                      assumption.kind === "metric"
                        ? copy(assumption.displayValue, locale)
                        : copy(assumption.note, locale);
                    return (
                      <div key={`${scenario.id}-${index}`}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    );
                  })}
                </dl>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="report-appendix" id="appendix">
        <header>
          <span>
            03 · {ko ? "근거·토론 부록" : "EVIDENCE & DEBATE APPENDIX"}
          </span>
          <h2>
            {ko
              ? "합의 과정을 감사 가능한 기록으로 남깁니다"
              : "The debate becomes an auditable record, not the report itself"}
          </h2>
        </header>
        <div>
          {report.appendix.map((section) => (
            <article key={section.title.en}>
              <h3>{copy(section.title, locale)}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item.en}>{copy(item, locale)}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <footer>
          <CheckCircle size={20} weight="fill" />
          <p>
            <strong>
              {ko ? "Research Chair 최종 근거" : "Research Chair rationale"}
            </strong>
            {copy(report.changeCondition, locale)}
          </p>
        </footer>
      </section>

      <section className="report-versions" id="versions">
        <header>
          <ClockCounterClockwise size={20} />
          <div>
            <span>04 · {ko ? "버전 기록" : "VERSION HISTORY"}</span>
            <p>
              {ko
                ? "재분석은 새 PDF가 아니라 같은 Research\u00a0File에 누적됩니다."
                : "Reanalysis is appended to the same Research File instead of creating disconnected PDFs."}
            </p>
          </div>
        </header>
        <ol>
          {report.versions.map((version) => (
            <li key={version.version}>
              <time>{version.date}</time>
              <strong>{version.version}</strong>
              <span>{copy(version.label, locale)}</span>
            </li>
          ))}
        </ol>
      </section>

      <ResearchReportSources locale={locale} sources={sources} />
    </main>
  );
}

import { Moon, Sun } from "@phosphor-icons/react";
import type { RefObject } from "react";
import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import { RESEARCH_DEPARTMENT_COPY } from "../../../research/domain/researchTarget";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import type { ResearchCompany } from "../../../research/types";

type Props = {
  readonly company: ResearchCompany;
  readonly file: ResearchFileData;
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
  readonly version: number;
  readonly theme: "light" | "dark";
  readonly onThemeChange: (theme: "light" | "dark") => void;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
};

export function ResearchFileHeader({
  company,
  file,
  model,
  locale,
  version,
  theme,
  onThemeChange,
  titleRef,
}: Props) {
  const ko = locale === "ko";
  const departmentId =
    file.researchTarget?.kind === "department"
      ? file.researchTarget.departmentId
      : undefined;
  const teamName =
    departmentId === undefined
      ? undefined
      : RESEARCH_DEPARTMENT_COPY[departmentId][ko ? "ko" : "en"];
  const departmentNavigation =
    departmentId === undefined
      ? undefined
      : {
          market: {
            decision: ko ? "타이밍 맵" : "Timing map",
            scenarios: ko ? "확인 구간" : "Confirmation zones",
          },
          company: {
            decision: ko ? "성장 엔진" : "Growth engines",
            scenarios: ko ? "실행 점검" : "Execution tests",
          },
          financial: {
            decision: ko ? "이익 품질" : "Earnings quality",
            scenarios: ko ? "내재 기대" : "Embedded expectations",
          },
          risk: {
            decision: ko ? "리스크 맵" : "Risk register",
            scenarios: ko ? "경보·임계치" : "Alerts & breakers",
          },
        }[departmentId];
  return (
    <>
      <header className="research-editorial-cover" data-report-section="cover">
        <div className="research-editorial-cover__utility">
          <div>
            <strong>{company.symbol}</strong>
            <span>{company.company}</span>
          </div>
          <dl>
            <div>
              <dt>{ko ? "리서치 버전" : "Research version"}</dt>
              <dd>v{version}.0</dd>
            </div>
            <div>
              <dt>{ko ? "기준 시각" : "As of"}</dt>
              <dd>{file.asOf[locale]}</dd>
            </div>
          </dl>
          <fieldset className="research-theme-toggle">
            <legend className="sr-only">
              {ko ? "보고서 화면 테마" : "Report display theme"}
            </legend>
            <button
              type="button"
              aria-pressed={theme === "light"}
              onClick={() => onThemeChange("light")}
            >
              <Sun size={15} aria-hidden="true" />
              <span>{ko ? "라이트" : "Light"}</span>
            </button>
            <button
              type="button"
              aria-pressed={theme === "dark"}
              onClick={() => onThemeChange("dark")}
            >
              <Moon size={15} aria-hidden="true" />
              <span>{ko ? "다크" : "Dark"}</span>
            </button>
          </fieldset>
        </div>
        <div className="research-editorial-cover__body">
          <p>{ko ? "사용자 질문" : "Research mandate"}</p>
          <h1 id="research-file-title" ref={titleRef} tabIndex={-1}>
            {model.question}
          </h1>
          <div className="research-conclusion-hero">
            <div>
              <span>
                {teamName === undefined
                  ? ko
                    ? "팀 결론 지수"
                    : "Team conclusion index"
                  : ko
                    ? `${teamName} 근거 확신도`
                    : `${teamName} evidence confidence`}
              </span>
              <p>
                <strong>{model.conclusionIndex}</strong>
                <small>/ 100</small>
              </p>
              <small>
                {teamName === undefined
                  ? ko
                    ? `팀 판단 40% · 주장 근거 35% · 최종 판단 25% · 근거 신뢰도 ${model.evidenceReliability}%`
                    : `Team votes 40% · claim evidence 35% · final posture 25% · evidence confidence ${model.evidenceReliability}%`
                  : ko
                    ? `팀 합의 50% · 주장 근거 50% · 교차팀 검토 제외 · 근거 신뢰도 ${model.evidenceReliability}%`
                    : `Team agreement 50% · claim evidence 50% · cross-team review excluded · evidence confidence ${model.evidenceReliability}%`}
              </small>
            </div>
            <strong>{model.conclusionLabel}</strong>
          </div>
          <div className="research-editorial-cover__answer">
            <span>{ko ? "직접 답변" : "Direct answer"}</span>
            <p>{model.directAnswer}</p>
            <strong>{model.conclusionLabel}</strong>
          </div>
        </div>
        <dl className="research-editorial-cover__metrics">
          {model.headlineMetrics.map((metric) => (
            <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
      </header>
      <nav
        className="research-editorial-index"
        aria-label={ko ? "리서치 파일 섹션" : "Research file sections"}
      >
        {file.comparison === undefined ? null : (
          <a href="#research-changes">{ko ? "변경점" : "Changes"}</a>
        )}
        <a href="#decision-brief">
          {departmentNavigation !== undefined
            ? departmentNavigation.decision
            : teamName === undefined
              ? ko
                ? "판단 요약"
                : "Decision"
              : ko
                ? "팀 결론"
                : "Team view"}
        </a>
        {file.researchTarget?.kind === "department" ? null : (
          <a href="#evidence-analysis">{ko ? "핵심 근거" : "Evidence"}</a>
        )}
        <a href="#decision-scenarios">
          {departmentNavigation?.scenarios ??
            (ko ? "비교·밸류에이션" : "Valuation")}
        </a>
        <a href="#team-debate">
          {teamName === undefined
            ? ko
              ? "팀 토론·판정"
              : "Debate"
            : ko
              ? "합의·이견"
              : "Agreement"}
        </a>
        {(file.anticipatedQuestions?.length ?? 0) === 0 ? null : (
          <a href="#research-anticipated-qa">
            {ko ? "예상 Q&A" : "Investor Q&A"}
          </a>
        )}
      </nav>
    </>
  );
}

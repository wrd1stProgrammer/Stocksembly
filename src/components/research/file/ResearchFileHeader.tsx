import { Moon, Sun } from "@phosphor-icons/react";
import type { RefObject } from "react";
import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
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
          <div
            className="research-theme-toggle"
            role="group"
            aria-label={ko ? "보고서 화면 테마" : "Report display theme"}
          >
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
          </div>
        </div>
        <div className="research-editorial-cover__body">
          <p>{ko ? "사용자 질문" : "Research mandate"}</p>
          <h1 id="research-file-title" ref={titleRef} tabIndex={-1}>
            {model.question}
          </h1>
          <div className="research-conclusion-hero">
            <div>
              <span>{ko ? "팀 결론 지수" : "Team conclusion index"}</span>
              <p>
                <strong>{model.conclusionIndex}</strong>
                <small>/ 100</small>
              </p>
              <small>
                {ko
                  ? `팀 판단 40% · 주장 근거 35% · 최종 판단 25% · 근거 신뢰도 ${model.evidenceReliability}%`
                  : `Team votes 40% · claim evidence 35% · final posture 25% · evidence confidence ${model.evidenceReliability}%`}
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
        <a href="#decision-brief">{ko ? "판단 요약" : "Decision"}</a>
        <a href="#evidence-analysis">{ko ? "사업·실적" : "Evidence"}</a>
        <a href="#decision-scenarios">{ko ? "비교·밸류에이션" : "Valuation"}</a>
        <a href="#team-debate">{ko ? "팀 토론·판정" : "Debate"}</a>
      </nav>
    </>
  );
}

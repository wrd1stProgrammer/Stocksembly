import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import {
  EvidenceStrength,
  ResearchFileSectionHeader,
} from "./ResearchFilePrimitives";

export function ResearchFileAnalysis({
  model,
  file,
  locale,
}: {
  readonly model: ResearchFileEditorialModel;
  readonly file: ResearchFileData;
  readonly locale: Locale;
}) {
  const ko = locale === "ko";
  const departmentId =
    file.researchTarget?.kind === "department"
      ? file.researchTarget.departmentId
      : undefined;
  const focusedTitle =
    departmentId === undefined
      ? undefined
      : {
          market: ko ? "시장 신호 근거 원장" : "Market signal evidence",
          company: ko ? "경쟁우위 검증 원장" : "Moat verification register",
          financial: ko ? "재무 근거 원장" : "Financial evidence register",
          risk: ko ? "위험 근거 원장" : "Risk evidence register",
        }[departmentId];
  return (
    <section
      className="research-editorial-section"
      data-report-section="analysis"
      id="evidence-analysis"
    >
      <ResearchFileSectionHeader
        number="02"
        title={
          focusedTitle !== undefined
            ? focusedTitle
            : ko
              ? "사업·실적·핵심 논지"
              : "Business, earnings & key theses"
        }
        description={
          departmentId !== undefined
            ? ko
              ? "선택 팀의 에이전트가 독립적으로 조사한 뒤 합의문에 채택한 주장과 남은 반론입니다."
              : "Claims independently researched by the selected team's agents, then retained in their consolidation."
            : ko
              ? "부서별 대표 논지와 이를 바꿀 반론·확인 조건만 남겼습니다."
              : "One representative thesis per team, with only the counterpoint and proof condition that could change it."
        }
      />
      <div className="research-thesis-register">
        {model.analysisRows.map((row) => (
          <article className="research-thesis-card" key={row.id}>
            <header className="research-thesis-card__header">
              <div className="research-thesis-card__identity">
                <span>{row.id}</span>
                <EvidenceStrength strength={row.strength} locale={locale} />
              </div>
              <h3>{row.title}</h3>
            </header>

            <div className="research-thesis-card__verdict">
              <span>{ko ? "팀 판단" : "Team view"}</span>
              <strong>{row.agentView}</strong>
            </div>

            <div className="research-thesis-card__details">
              <section className="research-thesis-card__evidence">
                <h4>{ko ? "확인된 근거" : "Verified evidence"}</h4>
                <p>{row.evidence}</p>
              </section>
              <section>
                <h4>{ko ? "핵심 반론" : "Key counterpoint"}</h4>
                <p>{row.counterpoint}</p>
              </section>
              <section>
                <h4>{ko ? "다음 확인" : "Next proof"}</h4>
                <p>{row.checkpoint}</p>
              </section>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

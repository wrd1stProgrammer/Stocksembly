import type { Locale } from "../../../lib/i18n";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import {
  EvidenceStrength,
  ResearchFileSectionHeader,
} from "./ResearchFilePrimitives";

export function ResearchFileAnalysis({
  model,
  locale,
}: {
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
}) {
  const ko = locale === "ko";
  return (
    <section
      className="research-editorial-section"
      data-report-section="analysis"
      id="evidence-analysis"
    >
      <ResearchFileSectionHeader
        number="02"
        title={ko ? "사업·실적·핵심 논지" : "Business, earnings & key theses"}
        description={
          ko
            ? "부서별 대표 논지와 이를 바꿀 반론·확인 조건만 남겼습니다."
            : "One representative thesis per team, with only the counterpoint and proof condition that could change it."
        }
      />
      <table className="research-analysis-table">
        <thead>
          <tr className="research-analysis-table__head">
            <th scope="col">
              {ko ? "핵심 논지·팀 판단" : "Key thesis & team view"}
            </th>
            <th scope="col">
              {ko
                ? "근거·반론·다음 확인"
                : "Evidence, counterpoint & next proof"}
            </th>
          </tr>
        </thead>
        <tbody>
          {model.analysisRows.map((row) => (
            <tr key={row.id}>
              <td data-label={ko ? "논지" : "Thesis"}>
                <span>{row.id}</span>
                <h3>{row.title}</h3>
                <EvidenceStrength strength={row.strength} locale={locale} />
                <p className="research-analysis-table__team-view">
                  <b>{ko ? "팀 판단" : "Team view"}</b>
                  <strong>{row.agentView}</strong>
                </p>
              </td>
              <td
                data-label={
                  ko
                    ? "근거·반론·다음 확인"
                    : "Evidence, counterpoint & next proof"
                }
              >
                <p>{row.evidence}</p>
                <div className="research-analysis-table__checks">
                  <p>
                    <b>{ko ? "반론" : "Counterpoint"}</b>
                    {row.counterpoint}
                  </p>
                  <p>
                    <b>{ko ? "다음 확인" : "Next proof"}</b>
                    {row.checkpoint}
                  </p>
                </div>
                {row.evidenceId === undefined ? null : (
                  <em>{row.evidenceId}</em>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

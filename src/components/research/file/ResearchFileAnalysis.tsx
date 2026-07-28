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
            ? "핵심 논지마다 팀의 해석, 확인된 근거와 반론, 다음 확인 조건을 함께 읽습니다."
            : "Each thesis pairs the team judgment with linked evidence, the counterpoint, and the next proof condition."
        }
      />
      <table className="research-analysis-table">
        <thead>
          <tr className="research-analysis-table__head">
            <th scope="col">{ko ? "핵심 논지" : "Key thesis"}</th>
            <th scope="col">{ko ? "팀 판단" : "Team judgment"}</th>
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
              </td>
              <td data-label={ko ? "팀 판단" : "Team judgment"}>
                <strong>{row.agentView}</strong>
              </td>
              <td
                data-label={
                  ko
                    ? "근거·반론·다음 확인"
                    : "Evidence, counterpoint & next proof"
                }
              >
                <p>{row.evidence}</p>
                <p>
                  <b>{ko ? "함께 볼 반론" : "Counterpoint"}</b>
                  {row.counterpoint}
                </p>
                <p>
                  <b>{ko ? "다음 확인" : "Next proof"}</b>
                  {row.checkpoint}
                </p>
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

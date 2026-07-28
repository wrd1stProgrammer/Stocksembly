import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import { ResearchFileSectionHeader } from "./ResearchFilePrimitives";

export function ResearchFileValuation({
  file,
  model,
  locale,
}: {
  readonly file: ResearchFileData;
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
}) {
  const ko = locale === "ko";
  return (
    <section
      className="research-editorial-section"
      data-report-section="scenarios"
      id="decision-scenarios"
    >
      <ResearchFileSectionHeader
        number="03"
        title={ko ? "밸류에이션·기업 비교" : "Valuation & relative comparison"}
        description={
          ko
            ? "현재 기대를 지지하는 성장·수익성 근거와 이를 흔들 조건을 비교합니다."
            : "Compare the growth and profitability evidence supporting current expectations with the conditions that would weaken them."
        }
      />
      <div className="research-valuation-lead">
        <div>
          <span>{ko ? "밸류에이션 결론" : "Valuation conclusion"}</span>
          <p className="research-valuation-lead__conclusion">
            {model.valuationConclusion}
          </p>
        </div>
        <dl>
          <div>
            <dt>{ko ? "관찰 가격" : "Observed price"}</dt>
            <dd>
              {file.marketSnapshot === undefined
                ? "—"
                : `${file.marketSnapshot.currency} ${file.marketSnapshot.price}`}
            </dd>
          </div>
          <div>
            <dt>{ko ? "다음 검증 이벤트" : "Next confirming event"}</dt>
            <dd>{model.nextVerificationEvent}</dd>
          </div>
        </dl>
      </div>
      <section className="research-comparison">
        <h3>{ko ? "상대 비교 렌즈" : "Relative comparison lens"}</h3>
        <table className="research-comparison__table">
          <thead>
            <tr>
              <th scope="col">{ko ? "비교 축" : "Dimension"}</th>
              <th scope="col">
                {ko ? "회사 관점·시장 기준" : "Company view & market reference"}
              </th>
              <th scope="col">{ko ? "해석" : "Interpretation"}</th>
            </tr>
          </thead>
          <tbody>
            {model.comparisonRows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>
                  <p>{row.companyView}</p>
                  {row.benchmarkLens.length === 0 ? null : (
                    <p className="research-comparison__reference">
                      <b>{ko ? "시장 기준" : "Market reference"}</b>
                      {row.benchmarkLens}
                    </p>
                  )}
                </td>
                <td>
                  {row.interpretation}
                  {row.evidenceId === undefined ? null : (
                    <em>{row.evidenceId}</em>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="research-scenarios">
        <h3>{ko ? "시나리오별 가정" : "Scenario assumptions"}</h3>
        {model.scenarios.map((scenario) => (
          <article key={scenario.id}>
            <header>
              <strong>{scenario.label}</strong>
              <p>{scenario.thesis}</p>
            </header>
            <ul>
              {scenario.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <aside className="research-judgment-threshold">
        <strong>
          {ko ? "판단을 바꿀 임계치" : "Thresholds that change the view"}
        </strong>
        <p>{file.changeCondition[locale]}</p>
      </aside>
    </section>
  );
}

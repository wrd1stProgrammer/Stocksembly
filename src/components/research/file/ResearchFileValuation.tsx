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
  const financialFocus =
    file.researchTarget?.kind !== "department" ||
    file.researchTarget.departmentId === "financial";
  return (
    <section
      className="research-editorial-section"
      data-report-section="scenarios"
      id="decision-scenarios"
    >
      <ResearchFileSectionHeader
        number="03"
        title={
          financialFocus
            ? ko
              ? "밸류에이션·기업 비교"
              : "Valuation & relative comparison"
            : ko
              ? "분석 범위·다음 확인"
              : "Scope boundary & next proof"
        }
        description={
          !financialFocus
            ? ko
              ? "이 팀이 확인한 범위와 전체 위원회 검토가 추가로 필요한 영역을 구분합니다."
              : "Separate what this team verified from what still requires a full committee review."
            : ko
              ? "현재 기대를 지지하는 성장·수익성 근거와 이를 흔들 조건을 비교합니다."
              : "Compare the growth and profitability evidence supporting current expectations with the conditions that would weaken them."
        }
      />
      <div className="research-valuation-lead">
        <div>
          <span>
            {financialFocus
              ? ko
                ? "밸류에이션 결론"
                : "Valuation conclusion"
              : ko
                ? "분석 범위 결론"
                : "Scope conclusion"}
          </span>
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
        <h3>
          {financialFocus
            ? ko
              ? "실적과 가격의 간극"
              : "Operating proof vs. market expectations"
            : ko
              ? "검증 범위 매트릭스"
              : "Verification scope matrix"}
        </h3>
        <table className="research-comparison__table">
          <thead>
            <tr>
              <th scope="col">
                {financialFocus
                  ? ko
                    ? "비교 축"
                    : "Dimension"
                  : ko
                    ? "검증 축"
                    : "Verification area"}
              </th>
              <th scope="col">
                {financialFocus
                  ? ko
                    ? "회사가 실제로 증명한 것"
                    : "What the company has proved"
                  : ko
                    ? "팀 확인 내용"
                    : "Team findings"}
              </th>
              <th scope="col">
                {ko ? "투자 해석" : "Investment read-through"}
              </th>
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
                      <b>
                        {ko ? "가격이 요구하는 기준" : "What the price demands"}
                      </b>
                      {row.benchmarkLens}
                    </p>
                  )}
                </td>
                <td>{row.interpretation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="research-scenarios">
        <h3>
          {financialFocus
            ? ko
              ? "시나리오별 가정"
              : "Scenario assumptions"
            : ko
              ? "다음 검증 조건"
              : "Next proof conditions"}
        </h3>
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

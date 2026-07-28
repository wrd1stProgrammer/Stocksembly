import type { Locale } from "../../../lib/i18n";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import {
  EditorialList,
  ResearchFileSectionHeader,
} from "./ResearchFilePrimitives";

export function ResearchFileDecision({
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
      data-report-section="decision"
      id="decision-brief"
    >
      <ResearchFileSectionHeader
        number="01"
        title={ko ? "투자 판단 한 장 요약" : "Decision brief"}
        description={
          ko
            ? "시장에 반영된 기대와 에이전트 팀의 판단이 어디에서 갈리는지 먼저 봅니다."
            : "Start with where embedded expectations and the agent team's view diverge."
        }
      />
      <div className="research-decision-overview">
        <section className="research-lens">
          <h3>{ko ? "핵심 논쟁" : "Core debate"}</h3>
          <div className="research-lens__table">
            {model.lensRows.map((row) => (
              <div key={row.label}>
                <strong>{row.label}</strong>
                <p>{row.content}</p>
              </div>
            ))}
          </div>
        </section>
        <aside className="research-company-snapshot">
          <h3>{ko ? "기업 핵심 지표" : "Company key metrics"}</h3>
          <dl>
            {model.companySnapshot.map((row) => (
              <div key={row.label} data-tone={row.tone}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
      <div className="research-decision-columns">
        <section>
          <h3>{ko ? "핵심 촉매" : "Key catalysts"}</h3>
          <EditorialList items={model.catalysts.slice(0, 3)} />
        </section>
        <section>
          <h3>{ko ? "핵심 리스크" : "Key risks"}</h3>
          <EditorialList items={model.risks.slice(0, 3)} />
        </section>
      </div>
    </section>
  );
}

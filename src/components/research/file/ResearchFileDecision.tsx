import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import {
  EditorialList,
  ResearchFileSectionHeader,
} from "./ResearchFilePrimitives";
import {
  ResearchDecisionPathBoard,
  ResearchEvidenceBalance,
  ResearchMetricStrip,
} from "./ResearchFileVisuals";

export function ResearchFileDecision({
  model,
  file,
  locale,
}: {
  readonly model: ResearchFileEditorialModel;
  readonly file: ResearchFileData;
  readonly locale: Locale;
}) {
  const ko = locale === "ko";
  const focused = file.researchTarget?.kind === "department";
  return (
    <section
      className="research-editorial-section"
      data-report-section="decision"
      id="decision-brief"
    >
      <ResearchFileSectionHeader
        number="01"
        title={
          focused
            ? ko
              ? "팀 심층검토 한 장 요약"
              : "Focused team brief"
            : ko
              ? "투자 판단 한 장 요약"
              : "Decision brief"
        }
        description={
          focused
            ? ko
              ? "선택한 팀이 확인한 핵심 근거, 반대 신호, 다음 검증 조건을 한 장에 정리합니다."
              : "A one-page view of the selected team's evidence, counter-signals, and next proof conditions."
            : ko
              ? "시장에 반영된 기대와 에이전트 팀의 판단이 어디에서 갈리는지 먼저 봅니다."
              : "Start with where embedded expectations and the agent team's view diverge."
        }
      />
      <div className="research-decision-dashboard">
        <ResearchMetricStrip metrics={model.visualMetrics} locale={locale} />
        <ResearchEvidenceBalance
          balance={model.evidenceBalance}
          locale={locale}
        />
      </div>
      <ResearchDecisionPathBoard paths={model.decisionPaths} locale={locale} />
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

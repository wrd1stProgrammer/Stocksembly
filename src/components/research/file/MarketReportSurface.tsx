import { MarketReportBrief, MarketReportFramework } from "./MarketReportBody";
import {
  type ResearchReportSurfaceProps,
  ResearchReportSurfaceShell,
} from "./ResearchReportSurfaceShell";
import { TechnicalChartResearchPage } from "./TechnicalChartResearchPage";

export function MarketReportSurface(props: ResearchReportSurfaceProps) {
  return (
    <ResearchReportSurfaceShell
      surface="market"
      departmentId="market"
      props={props}
      surfaceNavigation={[
        { href: "#market-regime", label: { en: "Regime", ko: "시장 국면" } },
        ...(props.report.technicalChart
          ? [
              {
                href: "#technical-chart" as const,
                label: { en: "Chart structure", ko: "차트 구조" },
              },
            ]
          : []),
        { href: "#market-timing", label: { en: "Timing", ko: "타이밍" } },
        { href: "#team-roundtable", label: { en: "Team view", ko: "팀 판단" } },
        ...((props.report.anticipatedQuestions?.length ?? 0) === 0
          ? []
          : [
              {
                href: "#research-anticipated-qa" as const,
                label: { en: "Investor Q&A", ko: "예상 Q&A" },
              },
            ]),
        { href: "#source-register", label: { en: "Sources", ko: "출처" } },
      ]}
    >
      <MarketReportBrief
        file={props.report}
        model={props.model}
        locale={props.locale}
      />
      <TechnicalChartResearchPage file={props.report} locale={props.locale} />
      <MarketReportFramework
        file={props.report}
        model={props.model}
        locale={props.locale}
      />
    </ResearchReportSurfaceShell>
  );
}

import {
  FinancialReportBrief,
  FinancialReportFramework,
} from "./FinancialReportBody";
import {
  type ResearchReportSurfaceProps,
  ResearchReportSurfaceShell,
} from "./ResearchReportSurfaceShell";

export function FinancialReportSurface(props: ResearchReportSurfaceProps) {
  return (
    <ResearchReportSurfaceShell
      surface="financial"
      departmentId="financial"
      props={props}
      surfaceNavigation={[
        { href: "#decision-brief", label: { en: "Earnings", ko: "이익·현금" } },
        { href: "#decision-scenarios", label: { en: "Expectations", ko: "기대·가치" } },
        { href: "#team-roundtable", label: { en: "Team view", ko: "팀 판단" } },
        ...((props.report.anticipatedQuestions?.length ?? 0) === 0
          ? []
          : [{ href: "#research-anticipated-qa" as const, label: { en: "Investor Q&A", ko: "예상 Q&A" } }]),
        { href: "#source-register", label: { en: "Sources", ko: "출처" } },
      ]}
    >
      <FinancialReportBrief
        file={props.report}
        model={props.model}
        locale={props.locale}
      />
      <FinancialReportFramework
        file={props.report}
        model={props.model}
        locale={props.locale}
      />
    </ResearchReportSurfaceShell>
  );
}

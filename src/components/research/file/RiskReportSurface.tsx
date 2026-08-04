import {
  type ResearchReportSurfaceProps,
  ResearchReportSurfaceShell,
} from "./ResearchReportSurfaceShell";
import { RiskReportBrief, RiskReportFramework } from "./RiskReportBody";

export function RiskReportSurface(props: ResearchReportSurfaceProps) {
  return (
    <ResearchReportSurfaceShell
      surface="risk"
      departmentId="risk"
      props={props}
      surfaceNavigation={[
        { href: "#decision-brief", label: { en: "Risk map", ko: "리스크 맵" } },
        {
          href: "#decision-scenarios",
          label: { en: "Alerts", ko: "경보·대응" },
        },
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
      <RiskReportBrief
        file={props.report}
        model={props.model}
        locale={props.locale}
      />
      <RiskReportFramework
        file={props.report}
        model={props.model}
        locale={props.locale}
      />
    </ResearchReportSurfaceShell>
  );
}

import {
  CompanyReportBrief,
  CompanyReportFramework,
} from "./CompanyReportBody";
import {
  type ResearchReportSurfaceProps,
  ResearchReportSurfaceShell,
} from "./ResearchReportSurfaceShell";

export function CompanyReportSurface(props: ResearchReportSurfaceProps) {
  return (
    <ResearchReportSurfaceShell
      surface="company"
      departmentId="company"
      props={props}
      surfaceNavigation={[
        {
          href: "#company-business",
          label: { en: "Business", ko: "사업 엔진" },
        },
        { href: "#company-moat", label: { en: "Moat", ko: "경쟁 좌표" } },
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
      <CompanyReportBrief
        file={props.report}
        model={props.model}
        locale={props.locale}
      />
      <CompanyReportFramework
        file={props.report}
        model={props.model}
        locale={props.locale}
      />
    </ResearchReportSurfaceShell>
  );
}

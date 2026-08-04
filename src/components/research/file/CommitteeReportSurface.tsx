import { ResearchFileComparison } from "./ResearchFileComparison";
import "./committee-report.css";
import { CommitteeDecisionCockpit } from "./CommitteeDecisionCockpit";
import {
  type ResearchReportSurfaceProps,
  ResearchReportSurfaceShell,
} from "./ResearchReportSurfaceShell";

export function CommitteeReportSurface(props: ResearchReportSurfaceProps) {
  return (
    <ResearchReportSurfaceShell surface="committee" props={props}>
      {props.report.comparison === undefined ? null : (
        <ResearchFileComparison
          comparison={props.report.comparison}
          locale={props.locale}
        />
      )}
      <CommitteeDecisionCockpit
        file={props.report}
        model={props.model}
        locale={props.locale}
      />
    </ResearchReportSurfaceShell>
  );
}

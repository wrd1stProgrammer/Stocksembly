import type { ReactNode, RefObject } from "react";
import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { WorkflowDepartmentId } from "../../../research/domain/roleRegistry";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import type { ResearchCompany } from "../../../research/types";
import { ResearchFileHeader } from "./ResearchFileHeader";
import { ResearchFileQuestions } from "./ResearchFileQuestions";
import { ResearchFileSources } from "./ResearchFileSources";
import { DepartmentResearchDesk } from "./DepartmentResearchDesk";

export type ResearchReportSurface =
  | "committee"
  | "market"
  | "company"
  | "financial"
  | "risk";

export type ResearchReportSurfaceProps = {
  readonly company: ResearchCompany;
  readonly locale: Locale;
  readonly report: ResearchFileData;
  readonly model: ResearchFileEditorialModel;
  readonly version: number;
  readonly reportId?: string;
  readonly onReplay: () => void;
  readonly theme: "light" | "dark";
  readonly onThemeChange: (theme: "light" | "dark") => void;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
};

export type ResearchSurfaceNavigation = readonly {
  readonly href: `#${string}`;
  readonly label: Readonly<Record<Locale, string>>;
}[];

const surfaceLabels: Readonly<
  Record<ResearchReportSurface, { readonly en: string; readonly ko: string }>
> = {
  committee: { en: "Committee research report", ko: "위원회 리서치 보고서" },
  market: { en: "Market research report", ko: "시장 리서치 보고서" },
  company: { en: "Company research report", ko: "기업 리서치 보고서" },
  financial: { en: "Financial research report", ko: "재무 리서치 보고서" },
  risk: { en: "Risk research report", ko: "리스크 리서치 보고서" },
};

export function ResearchReportSurfaceShell({
  surface,
  departmentId,
  props,
  surfaceNavigation,
  children,
}: {
  readonly surface: ResearchReportSurface;
  readonly departmentId?: WorkflowDepartmentId;
  readonly props: ResearchReportSurfaceProps;
  readonly surfaceNavigation?: ResearchSurfaceNavigation;
  readonly children: ReactNode;
}) {
  return (
    <section
      className="completed-research-file"
      aria-labelledby="research-file-title"
    >
      <article
        className="research-editorial-document"
        aria-label={surfaceLabels[surface][props.locale]}
        data-report-surface={surface}
        data-report-theme={props.theme}
        {...(departmentId === undefined
          ? {}
          : { "data-report-department": departmentId })}
      >
        <ResearchFileHeader
          company={props.company}
          file={props.report}
          model={props.model}
          locale={props.locale}
          version={props.version}
          theme={props.theme}
          onThemeChange={props.onThemeChange}
          titleRef={props.titleRef}
          decisionCockpit={surface === "committee"}
          {...(surfaceNavigation === undefined ? {} : { surfaceNavigation })}
        />
        {children}
        {departmentId === undefined ? null : (
          <DepartmentResearchDesk
            file={props.report}
            model={props.model}
            locale={props.locale}
            departmentId={departmentId}
          />
        )}
        <ResearchFileQuestions
          file={props.report}
          locale={props.locale}
          compact={surface !== "committee"}
        />
        <ResearchFileSources
          model={props.model}
          locale={props.locale}
          version={props.version}
          {...(props.reportId === undefined
            ? {}
            : { reportId: props.reportId })}
          onReplay={props.onReplay}
          collapsed
        />
      </article>
    </section>
  );
}

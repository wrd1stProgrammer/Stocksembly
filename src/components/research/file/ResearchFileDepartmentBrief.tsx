import type { Locale } from "../../../lib/i18n";
import type { ResearchFileData } from "../../../research/compositions/types";
import type { WorkflowDepartmentId } from "../../../research/domain/roleRegistry";
import type { ResearchFileEditorialModel } from "../../../research/researchFileEditorialModel";
import {
  CompanyReportBrief,
  CompanyReportFramework,
} from "./CompanyReportBody";
import {
  FinancialReportBrief,
  FinancialReportFramework,
} from "./FinancialReportBody";
import { MarketReportBrief, MarketReportFramework } from "./MarketReportBody";
import { RiskReportBrief, RiskReportFramework } from "./RiskReportBody";

type Props = {
  readonly departmentId: WorkflowDepartmentId;
  readonly file: ResearchFileData;
  readonly model: ResearchFileEditorialModel;
  readonly locale: Locale;
};

export function ResearchFileDepartmentBrief({
  departmentId,
  file,
  model,
  locale,
}: Props) {
  const props = { file, model, locale };
  switch (departmentId) {
    case "market":
      return <MarketReportBrief {...props} />;
    case "company":
      return <CompanyReportBrief {...props} />;
    case "financial":
      return <FinancialReportBrief {...props} />;
    case "risk":
      return <RiskReportBrief {...props} />;
  }
}

export function ResearchFileDepartmentFramework({
  departmentId,
  file,
  model,
  locale,
}: Props) {
  const props = { file, model, locale };
  switch (departmentId) {
    case "market":
      return <MarketReportFramework {...props} />;
    case "company":
      return <CompanyReportFramework {...props} />;
    case "financial":
      return <FinancialReportFramework {...props} />;
    case "risk":
      return <RiskReportFramework {...props} />;
  }
}

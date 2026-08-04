"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import type { ResearchFileData } from "../../research/compositions/types";
import { buildResearchFileEditorialModel } from "../../research/researchFileEditorialModel";
import type { ResearchCompany } from "../../research/types";
import { CommitteeReportSurface } from "./file/CommitteeReportSurface";
import { CompanyReportSurface } from "./file/CompanyReportSurface";
import { FinancialReportSurface } from "./file/FinancialReportSurface";
import { MarketReportSurface } from "./file/MarketReportSurface";
import type { ResearchReportSurfaceProps } from "./file/ResearchReportSurfaceShell";
import { RiskReportSurface } from "./file/RiskReportSurface";
import { UnsupportedResearchReport } from "./file/UnsupportedResearchReport";

type Props = {
  readonly company: ResearchCompany;
  readonly locale: Locale;
  readonly report: ResearchFileData;
  readonly version: number;
  readonly reportId?: string;
  readonly onReplay: () => void;
};

const themeStorageKey = "stocksembly-research-file-theme";

export function CompletedResearchFileV2({
  company,
  locale,
  report,
  version,
  reportId,
  onReplay,
}: Props) {
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const model = useMemo(
    () => buildResearchFileEditorialModel(report, locale),
    [locale, report],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(themeStorageKey);
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  const changeTheme = (nextTheme: "light" | "dark") => {
    setTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
  };

  const surfaceProps: ResearchReportSurfaceProps = {
    company,
    locale,
    report,
    model,
    version,
    ...(reportId === undefined ? {} : { reportId }),
    onReplay,
    theme,
    onThemeChange: changeTheme,
    titleRef,
  };

  const target = report.researchTarget;
  if (target === undefined || target.kind === "committee")
    return <CommitteeReportSurface {...surfaceProps} />;
  if (target.kind !== "department")
    return <UnsupportedResearchReport locale={locale} />;

  switch (target.departmentId) {
    case "market":
      return <MarketReportSurface {...surfaceProps} />;
    case "company":
      return <CompanyReportSurface {...surfaceProps} />;
    case "financial":
      return <FinancialReportSurface {...surfaceProps} />;
    case "risk":
      return <RiskReportSurface {...surfaceProps} />;
    default:
      return <UnsupportedResearchReport locale={locale} />;
  }
}

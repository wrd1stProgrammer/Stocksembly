"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import type { ResearchFileData } from "../../research/compositions/types";
import { buildResearchFileEditorialModel } from "../../research/researchFileEditorialModel";
import type { ResearchCompany } from "../../research/types";
import { ResearchFileAnalysis } from "./file/ResearchFileAnalysis";
import { ResearchFileComparison } from "./file/ResearchFileComparison";
import { ResearchFileDebate } from "./file/ResearchFileDebate";
import { ResearchFileDecision } from "./file/ResearchFileDecision";
import {
  ResearchFileDepartmentBrief,
  ResearchFileDepartmentFramework,
} from "./file/ResearchFileDepartmentBrief";
import { ResearchFileHeader } from "./file/ResearchFileHeader";
import { ResearchFileQuestions } from "./file/ResearchFileQuestions";
import { ResearchFileSources } from "./file/ResearchFileSources";
import { ResearchFileValuation } from "./file/ResearchFileValuation";

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
  const departmentId =
    report.researchTarget?.kind === "department"
      ? report.researchTarget.departmentId
      : undefined;

  useEffect(() => {
    const stored = window.localStorage.getItem(themeStorageKey);
    if (stored === "dark" || stored === "light") setTheme(stored);
  }, []);

  useEffect(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
    )
      return;
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const changeTheme = (nextTheme: "light" | "dark") => {
    setTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
  };

  return (
    <section
      className="completed-research-file"
      aria-labelledby="research-file-title"
    >
      <article
        className="research-editorial-document"
        data-report-theme={theme}
        {...(departmentId === undefined
          ? {}
          : { "data-report-department": departmentId })}
      >
        <ResearchFileHeader
          company={company}
          file={report}
          model={model}
          locale={locale}
          version={version}
          theme={theme}
          onThemeChange={changeTheme}
          titleRef={titleRef}
        />
        {report.comparison === undefined ? null : (
          <ResearchFileComparison
            comparison={report.comparison}
            locale={locale}
          />
        )}
        {departmentId === undefined ? (
          <ResearchFileDecision file={report} model={model} locale={locale} />
        ) : (
          <ResearchFileDepartmentBrief
            departmentId={departmentId}
            file={report}
            model={model}
            locale={locale}
          />
        )}
        {departmentId === undefined ? (
          <ResearchFileAnalysis file={report} model={model} locale={locale} />
        ) : null}
        {departmentId === undefined ? (
          <ResearchFileValuation file={report} model={model} locale={locale} />
        ) : (
          <ResearchFileDepartmentFramework
            departmentId={departmentId}
            file={report}
            model={model}
            locale={locale}
          />
        )}
        <ResearchFileDebate
          file={report}
          model={model}
          locale={locale}
          number={departmentId === undefined ? "04" : "03"}
        />
        <ResearchFileQuestions file={report} locale={locale} />
        <ResearchFileSources
          model={model}
          locale={locale}
          version={version}
          {...(reportId === undefined ? {} : { reportId })}
          onReplay={onReplay}
        />
      </article>
    </section>
  );
}

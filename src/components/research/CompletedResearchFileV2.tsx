"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import type { ResearchFileData } from "../../research/compositions/types";
import { buildResearchFileEditorialModel } from "../../research/researchFileEditorialModel";
import type { ResearchCompany } from "../../research/types";
import { ResearchFileAnalysis } from "./file/ResearchFileAnalysis";
import { ResearchFileDebate } from "./file/ResearchFileDebate";
import { ResearchFileDecision } from "./file/ResearchFileDecision";
import { ResearchFileHeader } from "./file/ResearchFileHeader";
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
        <ResearchFileDecision model={model} locale={locale} />
        <ResearchFileAnalysis model={model} locale={locale} />
        <ResearchFileValuation file={report} model={model} locale={locale} />
        <ResearchFileDebate
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

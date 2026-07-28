import { LinkSimple } from "@phosphor-icons/react";
import type { Locale } from "../../lib/i18n";
import type { ResearchSource } from "../../research/compositions/types";

type Props = {
  readonly locale: Locale;
  readonly sources: readonly ResearchSource[];
};

export function ResearchReportSources({ locale, sources }: Props) {
  return (
    <footer className="report-sources">
      <span>{locale === "ko" ? "주요 출처" : "PRIMARY SOURCES"}</span>
      <p>
        <LinkSimple size={15} />
        {sources.map((source) => (
          <span key={source.en}>{locale === "ko" ? source.ko : source.en}</span>
        ))}
      </p>
    </footer>
  );
}

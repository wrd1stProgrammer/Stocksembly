"use client";

import "../../styles/researchWorkspace";
import "../../styles/research-room.css";
import Link from "next/link";
import type { Locale } from "../../lib/i18n";
import type { ResearchFileData } from "../../research/compositions/types";
import type { ResearchCompany } from "../../research/types";
import { CompletedResearchFileV2 } from "./CompletedResearchFileV2";

export function FullReportPreview({
  company,
  report,
  reportId,
  locale = "ko",
}: {
  readonly company: ResearchCompany;
  readonly report: ResearchFileData;
  readonly reportId?: string;
  readonly locale?: Locale;
}) {
  return (
    <main className="team-report-preview">
      <nav aria-label="전체 리포트 로컬 미리보기">
        <strong>LOCAL QA · 전체 위원회 리포트</strong>
        <div>
          {(
            ["committee", "market", "company", "financial", "risk"] as const
          ).map((surface) => (
            <Link
              key={surface}
              href={`/dev/team-report/${surface}`}
              aria-current={surface === "committee" ? "page" : undefined}
            >
              {surface}
            </Link>
          ))}
        </div>
      </nav>
      <CompletedResearchFileV2
        company={company}
        locale={locale}
        report={report}
        {...(reportId === undefined ? {} : { reportId })}
        version={2}
        onReplay={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      />
    </main>
  );
}

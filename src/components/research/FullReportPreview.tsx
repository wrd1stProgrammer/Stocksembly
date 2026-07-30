"use client";

import type { ResearchFileData } from "../../research/compositions/types";
import type { ResearchCompany } from "../../research/types";
import { CompletedResearchFileV2 } from "./CompletedResearchFileV2";

export function FullReportPreview({
  company,
  report,
}: {
  readonly company: ResearchCompany;
  readonly report: ResearchFileData;
}) {
  return (
    <main className="team-report-preview">
      <nav aria-label="전체 리포트 로컬 미리보기">
        <strong>LOCAL QA · 전체 위원회 리포트</strong>
      </nav>
      <CompletedResearchFileV2
        company={company}
        locale="ko"
        report={report}
        version={2}
        onReplay={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      />
    </main>
  );
}

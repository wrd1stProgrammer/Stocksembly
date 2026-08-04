"use client";

import Link from "next/link";
import type { ResearchFileData } from "../../research/compositions/types";
import type { WorkflowDepartmentId } from "../../research/domain/roleRegistry";
import type { ResearchCompany } from "../../research/types";
import { CompletedResearchFileV2 } from "./CompletedResearchFileV2";

const TEAMS = [
  { id: "committee", label: "위원회" },
  { id: "market", label: "시장" },
  { id: "company", label: "기업" },
  { id: "financial", label: "재무" },
  { id: "risk", label: "리스크" },
] as const;

export function TeamReportPreview({
  company,
  departmentId,
  report,
}: {
  readonly company: ResearchCompany;
  readonly departmentId: WorkflowDepartmentId;
  readonly report: ResearchFileData;
}) {
  return (
    <main className="team-report-preview">
      <nav aria-label="팀 리포트 로컬 미리보기">
        <strong>LOCAL QA · 팀 리포트</strong>
        <div>
          {TEAMS.map((team) => (
            <Link
              key={team.id}
              href={`/dev/team-report/${team.id}`}
              aria-current={team.id === departmentId ? "page" : undefined}
            >
              {team.label}
            </Link>
          ))}
        </div>
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

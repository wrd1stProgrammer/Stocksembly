import { notFound } from "next/navigation";
import { FullReportPreview } from "@/src/components/research/FullReportPreview";
import { TeamReportPreview } from "@/src/components/research/TeamReportPreview";
import { committeeReportPreviewFixture } from "@/src/research/committeeReportPreviewFixture";
import { fixtureData } from "@/src/research/compositions/fixture";
import type { ResearchFileData } from "@/src/research/compositions/types";
import type { WorkflowDepartmentId } from "@/src/research/domain/roleRegistry";
import { teamReportPreviewFixture } from "@/src/research/teamReportPreviewFixture";

const DEPARTMENT_IDS = new Set<WorkflowDepartmentId>([
  "market",
  "company",
  "financial",
  "risk",
]);

export default async function TeamReportPreviewPage({
  params,
}: {
  readonly params: Promise<{ readonly department: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { department } = await params;
  if (department === "committee")
    return (
      <FullReportPreview
        company={fixtureData.createCompany(
          "NVDA",
          "NVIDIA Corporation",
          "NASDAQ",
          "Technology",
        )}
        report={committeeReportPreviewFixture()}
        reportId="committee-fixture"
      />
    );
  if (department === "invalid") {
    const malformedReport = {
      ...fixtureData.report,
      researchTarget: { kind: "department", departmentId: "unknown" },
    } as unknown as ResearchFileData;
    return (
      <TeamReportPreview
        company={fixtureData.createCompany(
          "NVDA",
          "NVIDIA Corporation",
          "NASDAQ",
          "Technology",
        )}
        departmentId="market"
        report={malformedReport}
      />
    );
  }
  if (!DEPARTMENT_IDS.has(department as WorkflowDepartmentId)) notFound();
  const departmentId = department as WorkflowDepartmentId;
  return (
    <TeamReportPreview
      company={{
        symbol: "NVDA",
        company: "NVIDIA Corporation",
        exchange: "NASDAQ",
        sector: "Technology",
        price: "172.41",
        change: "+1.8%",
        marketStatus: { en: "Market open", ko: "장중" },
      }}
      departmentId={departmentId}
      report={teamReportPreviewFixture(departmentId)}
    />
  );
}

import { notFound } from "next/navigation";
import { TeamReportPreview } from "@/src/components/research/TeamReportPreview";
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

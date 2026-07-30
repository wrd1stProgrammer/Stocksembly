import { notFound } from "next/navigation";
import { TeamReportPreview } from "@/src/components/research/TeamReportPreview";
import { findTicker } from "@/src/lib/tickers";
import { makeResearchCompany } from "@/src/research/mockResearch";
import { researchReportToFile } from "@/src/research/researchReportToFile";
import { prepareLiveResearchRuntime } from "@/src/research/server/api/liveResearchApi";
import { loadPublicResearchReport } from "@/src/research/server/api/researchApiReportReader";
import { ResearchApiRepository } from "@/src/research/server/api/researchApiRepository";
import { ensureLocalAuth } from "@/src/research/server/http/localAuth";

export default async function GeneratedReportPreviewPage({
  params,
}: {
  readonly params: Promise<{ readonly reportId: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { reportId } = await params;
  const runtime = await prepareLiveResearchRuntime();
  const auth = await ensureLocalAuth(runtime.dataRoot);
  const repository = new ResearchApiRepository({
    databasePath: runtime.databasePath,
  });

  try {
    const publication = repository.report(auth.principal.id, reportId);
    if (publication === undefined) notFound();
    const run = repository.findRun(auth.principal.id, publication.runId);
    if (
      run === undefined ||
      run.researchTarget.kind !== "department" ||
      run.reportId !== reportId
    )
      notFound();
    const report = await loadPublicResearchReport(
      { dataRoot: runtime.dataRoot },
      publication,
    );
    if (report === undefined) notFound();
    const ticker = findTicker(run.symbol);
    const company = makeResearchCompany(
      run.symbol,
      ticker?.company ?? run.symbol,
      ticker?.exchange ?? "US",
      ticker?.sector ?? "US listed company",
    );
    return (
      <TeamReportPreview
        company={company}
        departmentId={run.researchTarget.departmentId}
        report={researchReportToFile(report, run.createdAt)}
      />
    );
  } finally {
    repository.close();
  }
}

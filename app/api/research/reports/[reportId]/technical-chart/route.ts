import { loadAccessibleResearchReport } from "@/src/research/server/api/accessibleResearchReport";
import { readPublishedTechnicalChart } from "@/src/research/server/api/technicalChartReader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly reportId: string }> },
): Promise<Response> {
  const { reportId } = await context.params;
  const result = await loadAccessibleResearchReport(request, reportId);
  if (result instanceof Response) return result;
  const { report } = result;
  if (!report.technicalChart)
    return Response.json(
      { chart: null },
      { headers: { "cache-control": "private, no-store" } },
    );
  const chart = await readPublishedTechnicalChart(report.technicalChart);
  return Response.json(
    { chart: chart ?? null, digest: report.technicalChart.digest },
    { headers: { "cache-control": "private, no-store" } },
  );
}

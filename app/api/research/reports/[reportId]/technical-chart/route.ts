import { parseStoredResearchReportVersioned } from "@/src/research/domain/reportStorage";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import { readPublishedTechnicalChart } from "@/src/research/server/api/technicalChartReader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly reportId: string }> },
): Promise<Response> {
  const { reportId } = await context.params;
  const url = new URL(request.url);
  const reportUrl = new URL(
    `/api/research/reports/${encodeURIComponent(reportId)}`,
    request.url,
  );
  reportUrl.search = url.search;
  const response = await (await getLiveResearchApi()).handle(
    new Request(reportUrl, { headers: request.headers }),
  );
  if (!response.ok) return response;
  const body: unknown = await response.json();
  const report = parseStoredResearchReportVersioned(
    typeof body === "object" && body !== null
      ? Reflect.get(body, "report")
      : undefined,
  );
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

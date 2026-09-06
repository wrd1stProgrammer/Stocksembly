import { renderEditorialResearchReportPdf } from "@/src/research/pdf/renderEditorialResearchReportPdf";
import { loadAccessibleResearchReport } from "@/src/research/server/api/accessibleResearchReport";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import { readPublishedTechnicalChart } from "@/src/research/server/api/technicalChartReader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nested(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly reportId: string }> },
): Promise<Response> {
  const { reportId } = await context.params;
  const locale =
    new URL(request.url).searchParams.get("lang") === "ko" ? "ko" : "en";
  const api = await getLiveResearchApi();
  const result = await loadAccessibleResearchReport(request, reportId);
  if (result instanceof Response) return result;
  const { report } = result;

  const runUrl = new URL(`/api/research/runs/${report.runId}`, request.url);
  const runResponse = await api.handle(
    new Request(runUrl, { headers: request.headers }),
  );
  const runBody: unknown = runResponse.ok
    ? await runResponse.json()
    : undefined;
  const symbolValue = result.symbol ?? nested(nested(runBody, "run"), "symbol");
  const createdAtValue =
    result.createdAt ?? nested(nested(runBody, "run"), "createdAt");
  const symbol =
    typeof symbolValue === "string" && /^[A-Z]{1,5}$/.test(symbolValue)
      ? symbolValue
      : "EQUITY";
  const createdAt =
    typeof createdAtValue === "string"
      ? createdAtValue
      : new Date().toISOString();
  const technicalChart =
    report.technicalChart === undefined
      ? undefined
      : await readPublishedTechnicalChart(report.technicalChart);
  const renderInput = { report, symbol, locale, createdAt } as const;
  const bytes = await renderEditorialResearchReportPdf({
    ...renderInput,
    ...(technicalChart === undefined ? {} : { technicalChart }),
  }).catch((error: unknown) => {
    if (technicalChart === undefined) throw error;
    process.stderr.write(
      `${JSON.stringify({ kind: "optional_chart_pdf_omitted", reportId })}\n`,
    );
    return renderEditorialResearchReportPdf(renderInput);
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${symbol}-research-file-v${report.version}.pdf"`,
      "content-type": "application/pdf",
    },
  });
}

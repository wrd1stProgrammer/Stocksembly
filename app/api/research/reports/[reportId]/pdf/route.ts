import { parseStoredResearchReportVersioned } from "@/src/research/domain/reportStorage";
import { renderEditorialResearchReportPdf } from "@/src/research/pdf/renderEditorialResearchReportPdf";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

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
  const reportUrl = new URL(`/api/research/reports/${reportId}`, request.url);
  const reportResponse = await api.handle(
    new Request(reportUrl, { headers: request.headers }),
  );
  if (!reportResponse.ok) return reportResponse;
  const reportBody: unknown = await reportResponse.json();
  let report: ReturnType<typeof parseStoredResearchReportVersioned>;
  try {
    report = parseStoredResearchReportVersioned(nested(reportBody, "report"));
  } catch {
    return Response.json({ error: "REPORT_INVALID" }, { status: 500 });
  }

  const runUrl = new URL(`/api/research/runs/${report.runId}`, request.url);
  const runResponse = await api.handle(
    new Request(runUrl, { headers: request.headers }),
  );
  const runBody: unknown = runResponse.ok
    ? await runResponse.json()
    : undefined;
  const symbolValue = nested(nested(runBody, "run"), "symbol");
  const createdAtValue = nested(nested(runBody, "run"), "createdAt");
  const symbol =
    typeof symbolValue === "string" && /^[A-Z]{1,5}$/.test(symbolValue)
      ? symbolValue
      : "EQUITY";
  const createdAt =
    typeof createdAtValue === "string"
      ? createdAtValue
      : new Date().toISOString();
  const bytes = await renderEditorialResearchReportPdf({
    report,
    symbol,
    locale,
    createdAt,
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${symbol}-research-file-v${report.version}.pdf"`,
      "content-type": "application/pdf",
    },
  });
}

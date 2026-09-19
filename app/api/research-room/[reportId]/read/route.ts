import { z } from "zod";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import { loadResearchRoomReport } from "@/src/research/server/researchRoom/researchRoomCatalog";
import { requiresResearchRoomViewCredit } from "@/src/research/server/researchRoom/researchRoomIndexability";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !==
      new URL(process.env["STOCKSEMBLY_PUBLIC_ORIGIN"] ?? request.url).origin
  )
    return new Response(null, { status: 403 });
  const { reportId } = await params;
  if (!z.string().uuid().safeParse(reportId).success)
    return new Response(null, { status: 404 });
  const api = await getLiveResearchApi();
  const access = await api.researchRoomAccess(request);
  if (!access.authenticated) return new Response(null, { status: 401 });
  const owned = await api.handle(
    new Request(new URL(`/api/research/reports/${reportId}`, request.url), {
      headers: request.headers,
    }),
  );
  if (!owned.ok) {
    if (![401, 403, 404].includes(owned.status))
      return new Response(null, { status: 503 });
    const now = new Date();
    const report = await loadResearchRoomReport(reportId, access, now);
    if (!report || report === "locked")
      return new Response(null, { status: 403 });
    if (requiresResearchRoomViewCredit(report.item.publishedAt, now)) {
      const credit = await api.consumeResearchRoomCredit(
        request,
        reportId,
        true,
      );
      if (!credit.allowed || credit.required > 0)
        return new Response(null, { status: 403 });
    }
  }
  await api.recordReportRead(request, reportId);
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}

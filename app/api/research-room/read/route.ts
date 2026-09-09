import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const reportIds = await (
    await getLiveResearchApi()
  ).listReadResearchReportIds(request);
  return Response.json(
    { reportIds },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

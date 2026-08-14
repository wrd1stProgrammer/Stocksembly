import { parseAdminAnalyticsQuery } from "@/src/admin/analyticsContracts";
import { adminApiResponse } from "@/src/admin/server/adminApiResponse";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseAdminAnalyticsQuery(new URL(request.url).searchParams);
    return adminApiResponse(
      await (await getLiveResearchApi()).adminAnalyticsUsers(request, query),
    );
  } catch {
    return Response.json(
      { error: { code: "ADMIN_ANALYTICS_QUERY_INVALID" } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

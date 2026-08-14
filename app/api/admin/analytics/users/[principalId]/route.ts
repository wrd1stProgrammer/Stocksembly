import { parseAdminAnalyticsQuery } from "@/src/admin/analyticsContracts";
import { adminApiResponse } from "@/src/admin/server/adminApiResponse";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  readonly params: Promise<{ readonly principalId: string }>;
};

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const query = parseAdminAnalyticsQuery(new URL(request.url).searchParams);
    const { principalId } = await context.params;
    return adminApiResponse(
      await (await getLiveResearchApi()).adminAnalyticsUser(
        request,
        principalId,
        query,
      ),
    );
  } catch {
    return Response.json(
      { error: { code: "ADMIN_ANALYTICS_QUERY_INVALID" } },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

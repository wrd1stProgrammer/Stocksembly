import { acquisitionAttributionInputSchema } from "@/src/admin/analyticsContracts";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const policyRequest = request.clone();
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 8_192)
    return Response.json(
      { error: { code: "PAYLOAD_TOO_LARGE" } },
      { status: 413 },
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json(
      { error: { code: "CONTENT_TYPE_INVALID" } },
      { status: 415 },
    );
  const parsed = acquisitionAttributionInputSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return Response.json(
      { error: { code: "ATTRIBUTION_INVALID" } },
      { status: 400 },
    );
  return await (await getLiveResearchApi()).recordAcquisitionAttribution(
    policyRequest,
    parsed.data,
  );
}

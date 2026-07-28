import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return await (await getLiveResearchApi()).bootstrapSessionResponse(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return await (await getLiveResearchApi()).bootstrapSessionResponse(request);
}

import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return await (await getLiveResearchApi()).handle(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return await (await getLiveResearchApi()).handle(request);
}

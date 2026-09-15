import { appLocaleFromValue } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import { loadLandingResearchRoomPreview } from "../../../_lib/landingResearchRoomPreview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const locale = appLocaleFromValue(
    new URL(request.url).searchParams.get("lang"),
  );
  const access = await (await getLiveResearchApi()).researchRoomAccess(request);
  return Response.json(await loadLandingResearchRoomPreview(locale, access), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

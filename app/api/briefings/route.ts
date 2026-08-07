import { NextResponse } from "next/server";
import {
  loadLocalBriefingOverlay,
  mergeLocalBriefingOverlay,
} from "@/src/briefing/server/localBriefingPreviewStore";
import type { Locale } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const locale: Locale =
    new URL(request.url).searchParams.get("locale") === "en" ? "en" : "ko";
  const [result, overlay] = await Promise.all([
    (await getLiveResearchApi()).briefingRoom(request, locale),
    loadLocalBriefingOverlay(locale),
  ]);
  const response = mergeLocalBriefingOverlay(result, overlay);
  return NextResponse.json(response, {
    status: response.authenticated ? 200 : 401,
    headers: { "Cache-Control": "private, no-store" },
  });
}

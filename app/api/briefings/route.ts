import { NextResponse } from "next/server";
import type { Locale } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const locale: Locale =
    new URL(request.url).searchParams.get("locale") === "en" ? "en" : "ko";
  const result = await (await getLiveResearchApi()).briefingRoom(
    request,
    locale,
  );
  return NextResponse.json(result, {
    status: result.authenticated ? 200 : 401,
    headers: { "Cache-Control": "private, no-store" },
  });
}

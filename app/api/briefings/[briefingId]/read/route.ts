import { NextResponse } from "next/server";
import { z } from "zod";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly briefingId: string }> };

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const parsed = z
    .string()
    .uuid()
    .safeParse((await context.params).briefingId);
  if (!parsed.success)
    return NextResponse.json(
      { error: { code: "BRIEFING_ID_INVALID" } },
      { status: 400 },
    );
  const result = await (await getLiveResearchApi()).markBriefingRead(
    request,
    parsed.data,
  );
  return NextResponse.json(result, {
    status: result.authenticated ? 200 : 401,
    headers: { "Cache-Control": "private, no-store" },
  });
}

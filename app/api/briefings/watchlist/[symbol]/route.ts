import { NextResponse } from "next/server";
import { BriefingSymbolSchema } from "@/src/briefing/domain/contracts";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly symbol: string }> };

export async function DELETE(
  request: Request,
  context: Context,
): Promise<Response> {
  const parsed = BriefingSymbolSchema.safeParse((await context.params).symbol);
  if (!parsed.success)
    return NextResponse.json(
      { error: { code: "BRIEFING_SYMBOL_INVALID" } },
      { status: 400 },
    );
  const result = await (await getLiveResearchApi()).removeBriefingWatchlistItem(
    request,
    parsed.data,
  );
  return NextResponse.json(result, {
    status: result.authenticated ? 200 : 401,
    headers: { "Cache-Control": "private, no-store" },
  });
}

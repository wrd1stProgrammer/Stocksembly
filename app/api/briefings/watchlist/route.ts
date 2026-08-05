import { NextResponse } from "next/server";
import { BriefingSymbolSchema } from "@/src/briefing/domain/contracts";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
import { getLiveTickerCatalog } from "@/src/research/server/api/liveTickerCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => undefined)) as
    | { readonly symbol?: unknown }
    | undefined;
  const parsed = BriefingSymbolSchema.safeParse(body?.symbol);
  if (!parsed.success)
    return NextResponse.json(
      { error: { code: "BRIEFING_SYMBOL_INVALID" } },
      { status: 400 },
    );
  const catalog = await getLiveTickerCatalog();
  const candidates = await catalog.search(parsed.data);
  const company = candidates.find(
    (candidate) => candidate.symbol === parsed.data,
  );
  if (company === undefined)
    return NextResponse.json(
      { error: { code: "BRIEFING_SYMBOL_UNSUPPORTED" } },
      { status: 404 },
    );
  const result = await (await getLiveResearchApi()).addBriefingWatchlistItem(
    request,
    {
      symbol: company.symbol,
      providerCode: company.providerCode,
      company: company.company,
      exchange: company.exchange,
    },
  );
  const status = !result.authenticated
    ? 401
    : result.result === "forbidden"
      ? 403
      : result.result === "limit"
        ? 409
        : 200;
  return NextResponse.json(result, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

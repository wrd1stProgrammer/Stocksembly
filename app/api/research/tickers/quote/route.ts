import { getLiveTickerCatalog } from "../../../../../src/research/server/api/liveTickerCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const symbol =
    new URL(request.url).searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/u.test(symbol))
    return Response.json(
      { error: { code: "TICKER_SYMBOL_INVALID" } },
      { status: 400 },
    );
  try {
    const catalog = await getLiveTickerCatalog();
    const quote = await catalog.quote?.(symbol);
    if (
      quote?.lastPrice === undefined ||
      quote.currency === undefined ||
      quote.observedAt === undefined
    )
      return Response.json(
        { error: { code: "TICKER_QUOTE_UNAVAILABLE" } },
        { status: 404 },
      );
    return Response.json({
      quote: {
        lastPrice: quote.lastPrice,
        currency: quote.currency,
        observedAt: quote.observedAt,
        marketState: quote.marketState,
        ...(quote.change === undefined ? {} : { change: quote.change }),
        ...(quote.changePercent === undefined
          ? {}
          : { changePercent: quote.changePercent }),
      },
    });
  } catch (error) {
    if (error instanceof Error)
      return Response.json(
        { error: { code: "TICKER_QUOTE_UNAVAILABLE" } },
        { status: 503 },
      );
    throw error;
  }
}

import { getLiveTickerCatalog } from "../../../../src/research/server/api/liveTickerCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function createTickerRoute(
  catalog: typeof getLiveTickerCatalog,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 1 || query.length > 64)
      return Response.json(
        { error: { code: "TICKER_QUERY_INVALID" } },
        { status: 400 },
      );
    try {
      const tickers = (await (await catalog()).search(query)).map(
        ({ symbol, providerCode, company, exchange }) => ({
          symbol,
          providerCode,
          company,
          exchange,
        }),
      );
      return Response.json({ tickers });
    } catch (error) {
      if (error instanceof Error)
        return Response.json(
          { error: { code: "TICKER_CATALOG_UNAVAILABLE" } },
          { status: 503 },
        );
      throw error;
    }
  };
}

export const GET = createTickerRoute(getLiveTickerCatalog);

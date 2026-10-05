import { publicRequestBudget } from "@/src/lib/http/publicRequestBudget";
import { shortCache } from "@/src/lib/http/shortCache";
import type { getLiveTickerCatalog } from "../../../../src/research/server/api/liveTickerCatalog";

export function createTickerRoute(
  catalog: typeof getLiveTickerCatalog,
): (request: Request) => Promise<Response> {
  const cached =
    shortCache<
      Awaited<
        ReturnType<Awaited<ReturnType<typeof getLiveTickerCatalog>>["search"]>
      >
    >(60_000);
  return async (request) => {
    const rejected = publicRequestBudget(request, "ticker-search", 120);
    if (rejected) return rejected;
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 1 || query.length > 64)
      return Response.json(
        { error: { code: "TICKER_QUERY_INVALID" } },
        { status: 400 },
      );
    try {
      const tickers = (
        await cached(query.toUpperCase(), async () =>
          (await catalog()).search(query),
        )
      ).map(({ symbol, providerCode, company, exchange }) => ({
        symbol,
        providerCode,
        company,
        exchange,
      }));
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

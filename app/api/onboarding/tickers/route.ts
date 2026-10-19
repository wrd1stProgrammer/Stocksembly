export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80);
  if (!query) return Response.json({ tickers: [] });
  const response = await fetch(
    `https://stocksembly.com/api/research/tickers?q=${encodeURIComponent(query)}`,
    { signal: AbortSignal.timeout(8000) },
  );
  return new Response(response.body, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

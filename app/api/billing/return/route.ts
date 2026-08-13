export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const publicOrigin =
    process.env["STOCKSEMBLY_PUBLIC_ORIGIN"]?.trim() || url.origin;
  const destination =
    url.searchParams.get("target") === "local"
      ? new URL("http://localhost:3000/?billing=success")
      : new URL("/?billing=success", publicOrigin);
  return Response.redirect(destination, 303);
}

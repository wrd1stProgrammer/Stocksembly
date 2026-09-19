import { productEngagementSchema } from "@/src/admin/productEngagement";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const allowedOrigin = new URL(
    process.env["STOCKSEMBLY_PUBLIC_ORIGIN"] ?? request.url,
  ).origin;
  if (request.headers.get("origin") !== allowedOrigin)
    return new Response(null, { status: 403 });
  if (
    !(request.headers.get("cookie") ?? "")
      .split(";")
      .some((v) => v.trim() === "stocksembly_analytics_consent=granted")
  )
    return new Response(null, { status: 204 });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return new Response(null, { status: 415 });
  const body = await request.text();
  if (body.length > 2048) return new Response(null, { status: 413 });
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = productEngagementSchema.safeParse(input);
  if (
    !parsed.success ||
    Math.abs(Date.now() - Date.parse(parsed.data.endedAt)) > 300_000 ||
    Date.now() - Date.parse(parsed.data.startedAt) > 86_400_000
  )
    return new Response(null, { status: 400 });
  await (await getLiveResearchApi()).recordProductEngagement(
    request,
    parsed.data,
  );
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

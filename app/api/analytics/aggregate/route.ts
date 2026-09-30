import { randomUUID } from "node:crypto";
import { adminAnalyticsWritesEnabled } from "@/src/admin/adminAnalyticsFlags";
import {
  aggregateSchema,
  allowsAggregate,
} from "@/src/lib/analytics/aggregate";
import {
  posthogEnabled,
  posthogHost,
  posthogToken,
} from "@/src/lib/analytics/config";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const origin = new URL(
    process.env["STOCKSEMBLY_PUBLIC_ORIGIN"] ?? request.url,
  ).origin;
  if (request.headers.get("origin") !== origin)
    return new Response(null, { status: 403 });
  if (
    !posthogEnabled ||
    !adminAnalyticsWritesEnabled() ||
    !allowsAggregate(
      request.headers.get("cookie") ?? "",
      request.headers.get("sec-gpc") === "1",
      request.headers.get("dnt"),
    )
  )
    return new Response(null, { status: 204 });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return new Response(null, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > 1024) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(chunk.value);
  }
  let input: unknown;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = aggregateSchema.safeParse(input);
  if (!parsed.success) return new Response(null, { status: 400 });
  const { kind, ...counts } = parsed.data;
  const id = randomUUID();
  try {
    const response = await fetch(`${posthogHost}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: posthogToken,
        event: `aggregate_${kind}`,
        properties: {
          ...counts,
          distinct_id: id,
          $insert_id: id,
          $process_person_profile: false,
          $geoip_disable: true,
          $ip: null,
          measurement_mode: "unlinked_aggregate",
        },
      }),
      signal: AbortSignal.timeout(3000),
    });
    return new Response(null, { status: response.ok ? 204 : 502 });
  } catch {
    return new Response(null, { status: 502 });
  }
}

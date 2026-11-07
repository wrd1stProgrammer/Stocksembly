import { isIP } from "node:net";

const buckets = new Map<string, { count: number; until: number }>();
/** Per-process backstop; the fleet-wide provider quota remains authoritative. */
export function publicRequestBudget(
  request: Request,
  route: string,
  limit: number,
): Response | undefined {
  const now = Date.now();
  for (const [key, value] of buckets)
    if (value.until <= now) buckets.delete(key);
  // ALB appends the client, then nginx appends the ALB peer.
  // Only accept forwarded identities behind the configured trusted ingress.
  const configuredHops = Number(
    process.env["STOCKSEMBLY_TRUSTED_PROXY_HOPS"] ?? "2",
  );
  const hops =
    Number.isInteger(configuredHops) &&
    configuredHops >= 1 &&
    configuredHops <= 8
      ? configuredHops
      : 2;
  const peer = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .at(-hops)
    ?.trim();
  const identity = peer && isIP(peer) ? peer : "unidentified";
  for (const [key, maximum] of [
    [`${route}:${identity}`, limit],
    [route, limit * 20],
  ] as const) {
    const bucket = buckets.get(key) ?? { count: 0, until: now + 60_000 };
    if (
      bucket.count >= maximum ||
      (!buckets.has(key) && buckets.size >= 10_000)
    )
      return Response.json(
        { error: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "Retry-After": "60", "Cache-Control": "no-store" },
        },
      );
    bucket.count++;
    buckets.set(key, bucket);
  }
  return undefined;
}

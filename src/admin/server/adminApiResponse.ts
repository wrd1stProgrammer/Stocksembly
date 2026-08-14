import type { AdminAnalyticsReadResult } from "../../research/server/api/researchApi";

export function adminApiResponse<T>(
  result: AdminAnalyticsReadResult<T>,
): Response {
  const headers = { "Cache-Control": "private, no-store" };
  switch (result.kind) {
    case "ok":
      return Response.json(result.data, { headers });
    case "unauthenticated":
      return Response.json(
        { error: { code: "AUTHENTICATION_REQUIRED" } },
        { status: 401, headers },
      );
    case "forbidden":
      return Response.json(
        { error: { code: "ADMIN_ACCESS_REQUIRED" } },
        { status: 403, headers },
      );
    case "disabled":
    case "not_found":
      return Response.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404, headers },
      );
    case "unavailable":
      return Response.json(
        { error: { code: "ADMIN_ANALYTICS_UNAVAILABLE" } },
        { status: 503, headers },
      );
    default:
      result satisfies never;
      return new Response(null, { status: 500, headers });
  }
}

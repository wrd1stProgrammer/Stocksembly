export const dynamic = "force-dynamic";

// Process readiness only: a shared database outage must not trigger a fleet-wide
// replacement storm. Database health is monitored separately.
export function GET(): Response {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

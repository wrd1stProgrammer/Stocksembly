import type { BillingPlanKey } from "@/src/lib/whop/contracts";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePlanKey(value: string | null): BillingPlanKey | undefined {
  return value === "pro-monthly" ||
    value === "pro-annual" ||
    value === "ultra-monthly" ||
    value === "ultra-annual"
    ? value
    : undefined;
}

function acceptsJson(request: Request): boolean {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

export async function GET(request: Request): Promise<Response> {
  const planKey = parsePlanKey(new URL(request.url).searchParams.get("plan"));
  if (planKey === undefined)
    return Response.json({ error: "BILLING_PLAN_INVALID" }, { status: 400 });
  try {
    const response = await (await getLiveResearchApi()).billingCheckout(
      request,
      planKey,
    );
    if (response.status === 401 && !acceptsJson(request)) {
      const publicOrigin =
        process.env["STOCKSEMBLY_PUBLIC_ORIGIN"]?.trim() ??
        new URL(request.url).origin;
      const loginUrl = new URL("/login", publicOrigin);
      const checkoutUrl = new URL(request.url);
      loginUrl.searchParams.set(
        "next",
        `${checkoutUrl.pathname}${checkoutUrl.search}`,
      );
      return Response.redirect(loginUrl, 303);
    }
    return response;
  } catch (error) {
    console.error("Whop checkout is unavailable", error);
    return Response.json(
      { error: "BILLING_CHECKOUT_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

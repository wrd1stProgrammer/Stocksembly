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

export async function GET(request: Request): Promise<Response> {
  const planKey = parsePlanKey(new URL(request.url).searchParams.get("plan"));
  if (planKey === undefined)
    return Response.json({ error: "BILLING_PLAN_INVALID" }, { status: 400 });
  try {
    return await (await getLiveResearchApi()).billingCheckout(request, planKey);
  } catch (error) {
    console.error("Whop checkout is unavailable", error);
    return Response.json(
      { error: "BILLING_CHECKOUT_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

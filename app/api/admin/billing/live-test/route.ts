import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return await (await getLiveResearchApi()).adminBillingLiveTestCheckout(
      request,
    );
  } catch (error) {
    console.error("Whop live billing test checkout is unavailable", error);
    return Response.json(
      { error: { code: "BILLING_CHECKOUT_UNAVAILABLE" } },
      { status: 503 },
    );
  }
}

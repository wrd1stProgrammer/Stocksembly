import {
  getWhopEnvironment,
  getWhopPricing,
  getWhopProductId,
} from "@/src/lib/whop/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({
      environment: getWhopEnvironment(),
      productId: getWhopProductId(),
      plans: await getWhopPricing(),
    });
  } catch (error) {
    console.error("Whop pricing is unavailable", error);
    return Response.json({ error: "BILLING_UNAVAILABLE" }, { status: 503 });
  }
}

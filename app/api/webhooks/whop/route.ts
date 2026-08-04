import { AccountStoreUnavailableError } from "@/src/accounts/server/accountStore";
import { unwrapWhopWebhook } from "@/src/lib/whop/server";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  try {
    const event = unwrapWhopWebhook(
      body,
      Object.fromEntries(request.headers.entries()),
    );
    await (await getLiveResearchApi()).handleWhopWebhook(event);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Whop webhook rejected", error);
    return new Response(
      error instanceof AccountStoreUnavailableError
        ? "Account store unavailable"
        : "Webhook verification failed",
      { status: error instanceof AccountStoreUnavailableError ? 503 : 400 },
    );
  }
}

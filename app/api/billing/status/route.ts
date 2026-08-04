import { NextResponse } from "next/server";
import { AccountStoreUnavailableError } from "@/src/accounts/server/accountStore";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const status = await (await getLiveResearchApi()).billingStatus(request);
    return NextResponse.json(status, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof AccountStoreUnavailableError)
      return NextResponse.json(
        { error: "ACCOUNT_STORE_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    throw error;
  }
}

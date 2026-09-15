import { OnboardingSymbolsSchema } from "@/src/accounts/onboardingInterests";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  // Browser mutations must originate from this application, including cookie-authenticated requests.
  const origin = request.headers.get("origin");
  if (
    origin &&
    origin !==
      new URL(process.env["STOCKSEMBLY_PUBLIC_ORIGIN"] ?? request.url).origin
  )
    return Response.json(
      { error: { code: "ORIGIN_REJECTED" } },
      { status: 403 },
    );
  const body: unknown = await request.json().catch(() => null);
  const parsed = OnboardingSymbolsSchema.safeParse(
    body && typeof body === "object" && "symbols" in body
      ? body.symbols
      : undefined,
  );
  if (!parsed.success)
    return Response.json(
      { error: { code: "SELECT_ONE_TO_THREE_STOCKS" } },
      { status: 400 },
    );
  try {
    return await (await getLiveResearchApi()).prepareOnboardingStocks(
      request,
      parsed.data,
    );
  } catch {
    return Response.json(
      { error: { code: "PREPARATION_UNAVAILABLE" } },
      { status: 503 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    return await (await getLiveResearchApi()).onboardingStocks(request);
  } catch {
    return Response.json(
      { error: { code: "INTERESTS_UNAVAILABLE" } },
      { status: 503 },
    );
  }
}

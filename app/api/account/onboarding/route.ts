import { NextResponse } from "next/server";
import {
  CURRENT_ONBOARDING_VERSION,
  isOnboardingDiscoverySource,
} from "@/src/accounts/onboarding";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseOptions = { headers: { "Cache-Control": "private, no-store" } };
const LOCAL_ONBOARDING_COOKIE = "stocksembly_onboarding_version";

function localCookieFallbackEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    !process.env["STOCKSEMBLY_DATABASE_URL"] &&
    !process.env["STOCKSEMBLY_DB_SECRET_ARN"]
  );
}

function localOnboardingVersion(request: Request): number {
  const cookies = request.headers.get("cookie") ?? "";
  const value = cookies
    .split(";")
    .map((cookie) => cookie.trim().split("=", 2))
    .find(([name]) => name === LOCAL_ONBOARDING_COOKIE)?.[1];
  return Number.parseInt(value ?? "0", 10) || 0;
}

export async function GET(request: Request): Promise<Response> {
  const result = await (await getLiveResearchApi()).onboardingState(request);
  if (!result.authenticated)
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_REQUIRED" } },
      { status: 401 },
    );
  const completed = localCookieFallbackEnabled()
    ? localOnboardingVersion(request) >= CURRENT_ONBOARDING_VERSION
    : result.completed;
  return NextResponse.json(
    { completed, version: result.version },
    responseOptions,
  );
}

export async function PUT(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => undefined)) as
    | { readonly version?: unknown; readonly discoverySource?: unknown }
    | undefined;
  if (
    body?.version !== CURRENT_ONBOARDING_VERSION ||
    !isOnboardingDiscoverySource(body.discoverySource)
  )
    return NextResponse.json(
      { error: { code: "ONBOARDING_VERSION_INVALID" } },
      { status: 400 },
    );
  const result = await (await getLiveResearchApi()).completeOnboarding(
    request,
    CURRENT_ONBOARDING_VERSION,
    body.discoverySource,
  );
  if (!result.authenticated)
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_REQUIRED" } },
      { status: 401 },
    );
  if (!result.stored && localCookieFallbackEnabled()) {
    const response = NextResponse.json(
      { stored: true, version: result.version },
      responseOptions,
    );
    response.cookies.set(
      LOCAL_ONBOARDING_COOKIE,
      String(CURRENT_ONBOARDING_VERSION),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      },
    );
    return response;
  }
  if (!result.stored)
    return NextResponse.json(
      { error: { code: "ACCOUNT_STORE_UNAVAILABLE" } },
      { status: 503 },
    );
  return NextResponse.json(
    { stored: true, version: result.version },
    responseOptions,
  );
}

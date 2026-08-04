import { NextResponse } from "next/server";
import type { Locale } from "@/src/lib/i18n";
import { getLiveResearchApi } from "@/src/research/server/api/liveResearchApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "stocksembly_locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function localeCookie(response: NextResponse, locale: Locale) {
  response.cookies.set(COOKIE_NAME, locale, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function GET(request: Request): Promise<Response> {
  const preference = await (await getLiveResearchApi()).preferredLocale(
    request,
  );
  if (!preference.authenticated)
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_REQUIRED" } },
      { status: 401 },
    );
  const response = NextResponse.json(
    { locale: preference.locale ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  if (preference.locale !== undefined)
    localeCookie(response, preference.locale);
  return response;
}

export async function PUT(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => undefined)) as
    | { readonly locale?: unknown }
    | undefined;
  if (body?.locale !== "en" && body?.locale !== "ko")
    return NextResponse.json(
      { error: { code: "LOCALE_INVALID" } },
      { status: 400 },
    );
  const locale = body.locale;
  const result = await (await getLiveResearchApi()).updatePreferredLocale(
    request,
    locale,
  );
  if (!result.authenticated)
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_REQUIRED" } },
      { status: 401 },
    );
  const response = NextResponse.json(
    { locale, stored: result.stored },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  localeCookie(response, locale);
  return response;
}

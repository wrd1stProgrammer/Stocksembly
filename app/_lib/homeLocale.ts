import { cookies, headers } from "next/headers";
import { isLocale, resolveRequestLocale } from "@/src/lib/i18n";

export async function homeLocale(lang: string | undefined) {
  if (isLocale(lang)) return lang;
  const [requestHeaders, requestCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  return resolveRequestLocale({
    storedLocale: requestCookies.get("stocksembly_locale")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
    country:
      requestHeaders.get("x-vercel-ip-country") ??
      requestHeaders.get("cloudfront-viewer-country") ??
      requestHeaders.get("cf-ipcountry"),
  });
}

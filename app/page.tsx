import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { App } from "@/src/App";
import { resolveRequestLocale } from "@/src/lib/i18n";
import {
  homeStructuredData,
  serializeStructuredData,
} from "@/src/lib/seo/homeStructuredData";

export const metadata: Metadata = {
  alternates: {
    canonical: "/en",
  },
};

export default async function HomePage() {
  const [requestHeaders, requestCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const locale = resolveRequestLocale({
    storedLocale: requestCookies.get("stocksembly_locale")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
    country:
      requestHeaders.get("x-vercel-ip-country") ??
      requestHeaders.get("cloudfront-viewer-country") ??
      requestHeaders.get("cf-ipcountry"),
  });
  return (
    <>
      <App initialLocale={locale} />
      <script type="application/ld+json">
        {serializeStructuredData(homeStructuredData(locale))}
      </script>
    </>
  );
}

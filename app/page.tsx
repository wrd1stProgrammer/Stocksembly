import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { App } from "@/src/App";
import { isLocale, resolveRequestLocale } from "@/src/lib/i18n";
import {
  homeStructuredData,
  serializeStructuredData,
} from "@/src/lib/seo/homeStructuredData";

export const metadata: Metadata = {
  alternates: {
    canonical: "/en",
  },
};

type Props = {
  readonly searchParams: Promise<{ readonly lang?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const { lang } = await searchParams;
  const [requestHeaders, requestCookies] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const locale = isLocale(lang)
    ? lang
    : resolveRequestLocale({
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

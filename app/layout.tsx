import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies, headers } from "next/headers";
import Script from "next/script";
import type { ReactNode } from "react";
import { adminAnalyticsWritesEnabled } from "@/src/admin/adminAnalyticsFlags";
import { AnalyticsConsent } from "@/src/components/analytics/AnalyticsConsent";
import { AuthSessionBridge } from "@/src/components/auth/AuthSessionBridge";
import { ROUTE_LOCALE_HEADER } from "@/src/lib/agent/markdownHeaders";
import { isLocale, localeDetails, resolveRequestLocale } from "@/src/lib/i18n";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@/src/styles/tailwind.css";
import "@/src/styles/tokens.css";
import "@/src/styles/global.css";
import "@/src/styles/layout.css";

const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

const { NEXT_PUBLIC_GA_MEASUREMENT_ID } = process.env;
const googleAnalyticsMeasurementId = NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

export const metadata: Metadata = {
  metadataBase: new URL("https://stocksembly.com"),
  title: {
    default: "Stocksembly — AI Team Research for US Stocks",
    template: "%s · Stocksembly",
  },
  description:
    "Eleven AI specialists investigate the business, valuation, catalysts, and risks behind US stocks, then an independent chair delivers an evidence-linked judgment.",
  openGraph: {
    title: "Stocksembly — AI Team Research for US Stocks",
    description:
      "Eleven AI specialists investigate the business, valuation, catalysts, and risks behind US stocks, then an independent chair delivers an evidence-linked judgment.",
    siteName: "Stocksembly",
    type: "website",
    locale: "en_US",
    alternateLocale: [
      "ko_KR",
      "ja_JP",
      "zh_TW",
      "es_419",
      "pt_BR",
      "de_DE",
      "fr_FR",
    ],
    images: [
      {
        url: "/brand/stocksembly-app-icon.png",
        width: 1024,
        height: 1024,
        alt: "Stocksembly",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stocksembly — AI Team Research for US Stocks",
    description:
      "Eleven AI specialists investigate the business, valuation, catalysts, and risks behind US stocks, then an independent chair delivers an evidence-linked judgment.",
    images: ["/brand/stocksembly-app-icon.png"],
  },
  icons: {
    icon: "/brand/stocksembly-app-icon.png",
    apple: "/brand/stocksembly-app-icon.png",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#03060d",
  width: "device-width",
  initialScale: 1,
};

type RootLayoutProps = {
  readonly children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const requestHeaders = await headers();
  const requestCookies = await cookies();
  const country =
    requestHeaders.get("x-vercel-ip-country") ??
    requestHeaders.get("cloudfront-viewer-country") ??
    requestHeaders.get("cf-ipcountry") ??
    "";
  const storedLocale = requestCookies.get("stocksembly_locale")?.value;
  const pathLocale = requestHeaders.get(ROUTE_LOCALE_HEADER);
  const requestLocale = isLocale(pathLocale)
    ? pathLocale
    : resolveRequestLocale({
        storedLocale,
        acceptLanguage: requestHeaders.get("accept-language"),
        country,
      });
  return (
    <html
      lang={localeDetails[requestLocale].intl}
      className={inter.variable}
      data-country={country}
      data-locale={requestLocale}
    >
      <head>
        <link rel="describedby" href="/llms.txt" />
        <meta
          name="naver-site-verification"
          content="d0550c1445439dad95faf56141ffab5fa14761b3"
        />
        {process.env.NODE_ENV === "development" && (
          <>
            <Script
              src="//unpkg.com/react-grab/dist/index.global.js"
              crossOrigin="anonymous"
              strategy="beforeInteractive"
            />
            <Script
              src="https://unpkg.com/react-scan/dist/auto.global.js"
              crossOrigin="anonymous"
              strategy="afterInteractive"
            />
          </>
        )}
      </head>
      <body>
        <AuthSessionBridge />
        {children}
        <AnalyticsConsent
          enabled={adminAnalyticsWritesEnabled()}
          {...(googleAnalyticsMeasurementId === undefined
            ? {}
            : { measurementId: googleAnalyticsMeasurementId })}
        />
      </body>
    </html>
  );
}

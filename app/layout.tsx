import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import type { ReactNode } from "react";
import { AuthSessionBridge } from "@/src/components/auth/AuthSessionBridge";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@/src/styles/tokens.css";
import "@/src/styles/global.css";
import "@/src/styles/layout.css";
import "@/src/styles/search-controls.css";
import "@/src/styles/search-states.css";
import "@/src/styles/landing.css";
import "@/src/styles/legal.css";
import "@/src/styles/showcase.css";
import "@/src/styles/responsive.css";
import "@/src/styles/research-shell.css";
import "@/src/styles/research-rail.css";
import "@/src/styles/research-activity.css";
import "@/src/styles/research-office.css";
import "@/src/styles/research-agents.css";
import "@/src/styles/research-report.css";
import "@/src/styles/research-responsive.css";
import "@/src/styles/research-workspace-v2.css";
import "@/src/styles/research-tablet-status.css";
import "@/src/styles/research-mobile-report.css";
import "@/src/styles/auth.css";

const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

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
    alternateLocale: "ko_KR",
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

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
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
      </body>
    </html>
  );
}

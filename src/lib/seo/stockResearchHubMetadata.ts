import type { Metadata } from "next";
import type { StockSymbol } from "../../research/server/researchRoom/researchRoomPublicCatalog";
import type { StockResearchHub } from "../../research/server/researchRoom/stockResearchHubCatalog";
import type { Locale } from "../i18n";

export function stockResearchHubPaths(
  symbol: StockSymbol,
): Readonly<Record<Locale, string>> {
  const slug = symbol.toLowerCase();
  return {
    ko: `/ko/stocks/${slug}`,
    en: `/en/stocks/${slug}`,
  };
}

export function stockResearchHubMetadata(
  locale: Locale,
  hub: StockResearchHub,
): Metadata {
  const paths = stockResearchHubPaths(hub.symbol);
  const title =
    locale === "ko"
      ? `${hub.company}(${hub.symbol}) 미국주식 분석 | Stocksembly`
      : `${hub.company} (${hub.symbol}) Stock Analysis | Stocksembly`;
  const description =
    locale === "ko"
      ? `Stocksembly에서 발행 7일이 지난 ${hub.company}(${hub.symbol}) 공개 리서치를 한곳에서 확인하세요. 기업, 재무, 시장, 리스크 관점의 미국주식 분석을 제공합니다.`
      : `Read Stocksembly's public ${hub.company} (${hub.symbol}) research after its seven-day member window, covering company, financial, market, and risk analysis.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: paths[locale],
      languages: {
        "ko-KR": paths.ko,
        "en-US": paths.en,
        "x-default": paths.en,
      },
    },
    openGraph: {
      title,
      description,
      url: paths[locale],
      siteName: "Stocksembly",
      type: "website",
      locale: locale === "ko" ? "ko_KR" : "en_US",
      alternateLocale: locale === "ko" ? "en_US" : "ko_KR",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export function unavailableStockResearchHubMetadata(locale: Locale): Metadata {
  return {
    title: {
      absolute:
        locale === "ko"
          ? "미국주식 분석 | Stocksembly"
          : "US Stock Analysis | Stocksembly",
    },
    robots: { index: false, follow: false },
  };
}

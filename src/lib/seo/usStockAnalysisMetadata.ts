import type { Metadata } from "next";
import type { Locale } from "../i18n";
import {
  US_STOCK_ANALYSIS_PATHS,
  usStockAnalysisCopy,
} from "./usStockAnalysis";

export function usStockAnalysisMetadata(locale: Locale): Metadata {
  const content = usStockAnalysisCopy[locale];
  const canonical = US_STOCK_ANALYSIS_PATHS[locale];
  return {
    title: content.metadata.title,
    description: content.metadata.description,
    alternates: {
      canonical,
      languages: {
        "ko-KR": US_STOCK_ANALYSIS_PATHS.ko,
        "en-US": US_STOCK_ANALYSIS_PATHS.en,
        "x-default": US_STOCK_ANALYSIS_PATHS.en,
      },
    },
    openGraph: {
      title: content.metadata.title,
      description: content.metadata.description,
      url: canonical,
      siteName: "Stocksembly",
      type: "website",
      locale: locale === "ko" ? "ko_KR" : "en_US",
      alternateLocale: locale === "ko" ? "en_US" : "ko_KR",
    },
    twitter: {
      card: "summary",
      title: content.metadata.title,
      description: content.metadata.description,
    },
  };
}

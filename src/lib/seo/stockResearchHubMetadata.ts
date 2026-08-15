import type { Metadata } from "next";
import type { StockSymbol } from "../../research/server/researchRoom/researchRoomPublicCatalog";
import type { StockResearchHub } from "../../research/server/researchRoom/stockResearchHubCatalog";
import type { AppLocale } from "../i18n";
import { localeDetails, locales, uiMessage } from "../i18n";

export function stockResearchHubPaths(
  symbol: StockSymbol,
): Readonly<Record<AppLocale, string>> {
  const slug = symbol.toLowerCase();
  return {
    ko: `/ko/stocks/${slug}`,
    en: `/en/stocks/${slug}`,
    ja: `/ja/stocks/${slug}`,
    "zh-TW": `/zh-TW/stocks/${slug}`,
    es: `/es/stocks/${slug}`,
    "pt-BR": `/pt-BR/stocks/${slug}`,
    de: `/de/stocks/${slug}`,
    fr: `/fr/stocks/${slug}`,
  };
}

export function stockResearchHubMetadata(
  locale: AppLocale,
  hub: StockResearchHub,
): Metadata {
  const paths = stockResearchHubPaths(hub.symbol);
  const title = uiMessage(locale, {
    en: `${hub.company} (${hub.symbol}) Stock Analysis | Stocksembly`,
    ko: `${hub.company}(${hub.symbol}) 미국주식 분석 | Stocksembly`,
    ja: `${hub.company}（${hub.symbol}）米国株分析 | Stocksembly`,
    "zh-TW": `${hub.company}（${hub.symbol}）美股分析 | Stocksembly`,
    es: `Análisis de ${hub.company} (${hub.symbol}) | Stocksembly`,
    "pt-BR": `Análise de ${hub.company} (${hub.symbol}) | Stocksembly`,
    de: `${hub.company} (${hub.symbol}) Aktienanalyse | Stocksembly`,
    fr: `Analyse de ${hub.company} (${hub.symbol}) | Stocksembly`,
  });
  const description = uiMessage(locale, {
    en: `Read Stocksembly's public ${hub.company} (${hub.symbol}) research after its seven-day member window, covering company, financial, market, and risk analysis.`,
    ko: `Stocksembly에서 발행 7일이 지난 ${hub.company}(${hub.symbol}) 공개 리서치를 한곳에서 확인하세요. 기업, 재무, 시장, 리스크 관점의 미국주식 분석을 제공합니다.`,
    ja: `${hub.company}（${hub.symbol}）の企業・財務・市場・リスク分析をまとめた、公開から7日経過後のStocksemblyリサーチです。`,
    "zh-TW": `閱讀 ${hub.company}（${hub.symbol}）在七天會員期後公開的企業、財務、市場與風險研究。`,
    es: `Consulta el análisis público de ${hub.company} (${hub.symbol}) tras su periodo de siete días para miembros, con perspectivas de empresa, finanzas, mercado y riesgo.`,
    "pt-BR": `Leia o research público de ${hub.company} (${hub.symbol}) após a janela de sete dias para assinantes, com análises de empresa, finanças, mercado e risco.`,
    de: `Lesen Sie die öffentliche Analyse zu ${hub.company} (${hub.symbol}) nach dem siebentägigen Mitgliederfenster – mit Unternehmens-, Finanz-, Markt- und Risikoperspektive.`,
    fr: `Consultez l’analyse publique de ${hub.company} (${hub.symbol}) après la période de sept jours réservée aux membres, avec les volets entreprise, finance, marché et risque.`,
  });
  const languageAlternates = Object.fromEntries(
    locales.map((value) => [localeDetails[value].hreflang, paths[value]]),
  );
  return {
    title: { absolute: title },
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: paths[locale],
      languages: { ...languageAlternates, "x-default": paths.en },
    },
    openGraph: {
      title,
      description,
      url: paths[locale],
      siteName: "Stocksembly",
      type: "website",
      locale: localeDetails[locale].openGraph,
      alternateLocale:
        locale === "ko" ? "en_US" : locale === "en" ? "ko_KR" : "en_US",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export function unavailableStockResearchHubMetadata(
  locale: AppLocale,
): Metadata {
  return {
    title: {
      absolute: uiMessage(locale, {
        en: "US Stock Analysis | Stocksembly",
        ko: "미국주식 분석 | Stocksembly",
        ja: "米国株分析 | Stocksembly",
        "zh-TW": "美股分析 | Stocksembly",
        es: "Análisis de acciones de EE. UU. | Stocksembly",
        "pt-BR": "Análise de ações dos EUA | Stocksembly",
        de: "US-Aktienanalyse | Stocksembly",
        fr: "Analyse des actions américaines | Stocksembly",
      }),
    },
    robots: { index: false, follow: false },
  };
}

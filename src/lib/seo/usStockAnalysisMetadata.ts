import type { Metadata } from "next";
import type { AppLocale } from "../i18n";
import { localeDetails, locales } from "../i18n";
import { boundedSeoDescription, boundedSeoTitle } from "./metadataText";
import {
  US_STOCK_ANALYSIS_PATHS,
  usStockAnalysisContent,
} from "./usStockAnalysis";

const metadataCopy: Readonly<
  Record<AppLocale, { title: string; description: string }>
> = {
  en: {
    title: "AI Stock Analysis for US Equities | Stocksembly",
    description:
      "Eleven AI specialist roles examine SEC filings, earnings, market data, valuation, and risk. Start evidence-linked US stock analysis with the countercase included.",
  },
  ko: {
    title: "미국주식 AI 분석 | 팀 리서치 Stocksembly",
    description:
      "11개 AI 전문 역할이 SEC 공시, 실적, 시장 데이터, 밸류에이션과 리스크를 교차 검토합니다. 근거와 반론이 함께 보이는 미국주식 분석을 시작하세요.",
  },
  ja: {
    title: "米国株AI分析 | Stocksembly チームリサーチ",
    description:
      "11のAI専門役がSEC提出書類、決算、市場データ、バリュエーション、リスクを検証。反対論と根拠を含む米国株リサーチを始められます。",
  },
  "zh-TW": {
    title: "美股 AI 分析 | Stocksembly 團隊研究",
    description:
      "11 位 AI 專家交叉檢視 SEC 文件、財報、市場資料、估值與風險，提供同時呈現證據與反方論點的美股研究。",
  },
  es: {
    title: "Análisis de acciones de EE. UU. con IA | Stocksembly",
    description:
      "Once especialistas de IA revisan documentos de la SEC, resultados, datos de mercado, valoración y riesgos, incluida la tesis contraria.",
  },
  "pt-BR": {
    title: "Análise de ações dos EUA com IA | Stocksembly",
    description:
      "Onze especialistas de IA analisam documentos da SEC, resultados, dados de mercado, valuation e riscos, incluindo a tese contrária.",
  },
  de: {
    title: "KI-Analyse für US-Aktien | Stocksembly",
    description:
      "Elf KI-Fachrollen prüfen SEC-Berichte, Quartalszahlen, Marktdaten, Bewertung und Risiken – einschließlich der Gegenposition.",
  },
  fr: {
    title: "Analyse IA des actions américaines | Stocksembly",
    description:
      "Onze rôles spécialisés en IA examinent les documents SEC, les résultats, les données de marché, la valorisation et les risques, y compris la thèse opposée.",
  },
};

export function usStockAnalysisMetadata(locale: AppLocale): Metadata {
  const authoredContent = usStockAnalysisContent(locale);
  const content = { ...authoredContent, metadata: metadataCopy[locale] };
  const title = boundedSeoTitle(content.metadata.title);
  const description = boundedSeoDescription(content.metadata.description);
  const canonical = US_STOCK_ANALYSIS_PATHS[locale];
  const languageAlternates = Object.fromEntries(
    locales.map((value) => [
      localeDetails[value].hreflang,
      US_STOCK_ANALYSIS_PATHS[value],
    ]),
  );
  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical,
      languages: {
        ...languageAlternates,
        "x-default": US_STOCK_ANALYSIS_PATHS.en,
      },
    },
    openGraph: {
      title,
      description,
      url: canonical,
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

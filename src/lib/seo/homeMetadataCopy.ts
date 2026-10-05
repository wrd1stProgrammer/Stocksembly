import type { AppLocale } from "../supportedLocales";

export const homeMetadataCopy: Readonly<
  Record<AppLocale, { readonly title: string; readonly description: string }>
> = {
  ko: {
    title: "미국주식 분석 · 리서치 · 종목 분석 | Stocksembly",
    description:
      "미국주식 분석과 관심 종목 브리핑을 제공. AI 분석팀이 기업·시장·재무·리스크를 여러 관점에서 검토하고, 근거와 출처가 담긴 리서치에 후속 질문을 이어갈 수 있습니다.",
  },
  en: {
    title: "US Stock Analysis · Research · Stock Analysis | Stocksembly",
    description:
      "US stock analysis and watchlist briefings. An AI research team examines companies, markets, financials, and risks from multiple perspectives. Ask follow-up questions about research backed by evidence and sources.",
  },
  ja: {
    title: "米国株分析・リサーチ・銘柄分析 | Stocksembly",
    description:
      "米国株分析とウォッチリスト銘柄のブリーフィングを提供。AI分析チームが企業・市場・財務・リスクを多角的に検討し、根拠と出典を示したリサーチに追加の質問ができます。",
  },
  "zh-TW": {
    title: "美股分析・投資研究・個股分析 | Stocksembly",
    description:
      "提供美股分析與關注個股簡報。AI 分析團隊從企業、市場、財務與風險等多種角度進行研究，並提供佐證與資料來源，讓您透過後續提問深入探討研究內容。",
  },
  es: {
    title: "Análisis bursátil de EE. UU. e investigación | Stocksembly",
    description:
      "Análisis de acciones de EE. UU. y resúmenes de tus acciones favoritas. Un equipo de IA estudia empresas, mercados, finanzas y riesgos desde varias perspectivas. Haz preguntas de seguimiento sobre análisis con evidencias y fuentes.",
  },
  "pt-BR": {
    title: "Análise de ações dos EUA e pesquisa | Stocksembly",
    description:
      "Análise de ações dos EUA e resumos das ações que você acompanha. Uma equipe de IA examina empresas, mercados, finanças e riscos sob várias perspectivas. Faça perguntas sobre pesquisas com evidências e fontes.",
  },
  de: {
    title: "US-Aktienanalyse und Aktienresearch | Stocksembly",
    description:
      "US-Aktienanalysen und Briefings zu Ihrer Watchlist. Ein KI-Analyseteam untersucht Unternehmen, Märkte, Finanzen und Risiken aus verschiedenen Perspektiven. Stellen Sie Rückfragen zu Research mit Belegen und Quellen.",
  },
  fr: {
    title: "Analyse et recherche sur les actions US | Stocksembly",
    description:
      "Analyse des actions américaines et points sur vos valeurs suivies. Une équipe d’IA examine entreprises, marchés, finances et risques sous plusieurs angles. Posez des questions de suivi sur des analyses étayées par des preuves et des sources.",
  },
};

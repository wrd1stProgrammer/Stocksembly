import type { ActiveResearchActivityKind } from "../research/domain/activeResearchActivity";
import type { AgentId } from "../research/types";
import {
  type AppLocale,
  DEFAULT_LOCALE,
  isLocale,
  locales,
} from "./supportedLocales";

export { type AppLocale, DEFAULT_LOCALE, isLocale, locales };
export type Locale = "en" | "ko";

export const localeDetails: Readonly<
  Record<
    AppLocale,
    {
      readonly label: string;
      readonly nativeLabel: string;
      readonly intl: string;
      readonly hreflang: string;
      readonly openGraph: string;
    }
  >
> = {
  en: {
    label: "English",
    nativeLabel: "English",
    intl: "en-US",
    hreflang: "en-US",
    openGraph: "en_US",
  },
  ko: {
    label: "Korean",
    nativeLabel: "한국어",
    intl: "ko-KR",
    hreflang: "ko-KR",
    openGraph: "ko_KR",
  },
  ja: {
    label: "Japanese",
    nativeLabel: "日本語",
    intl: "ja-JP",
    hreflang: "ja-JP",
    openGraph: "ja_JP",
  },
  "zh-TW": {
    label: "Traditional Chinese",
    nativeLabel: "繁體中文",
    intl: "zh-TW",
    hreflang: "zh-TW",
    openGraph: "zh_TW",
  },
  es: {
    label: "Spanish",
    nativeLabel: "Español",
    intl: "es-419",
    hreflang: "es-419",
    openGraph: "es_419",
  },
  "pt-BR": {
    label: "Brazilian Portuguese",
    nativeLabel: "Português (Brasil)",
    intl: "pt-BR",
    hreflang: "pt-BR",
    openGraph: "pt_BR",
  },
  de: {
    label: "German",
    nativeLabel: "Deutsch",
    intl: "de-DE",
    hreflang: "de-DE",
    openGraph: "de_DE",
  },
  fr: {
    label: "French",
    nativeLabel: "Français",
    intl: "fr-FR",
    hreflang: "fr-FR",
    openGraph: "fr_FR",
  },
};

export function localeFromLanguageTag(
  value: string | null | undefined,
): AppLocale | undefined {
  if (!value) return undefined;
  const tag = value.trim().replaceAll("_", "-").toLowerCase();
  if (tag.startsWith("ko")) return "ko";
  if (tag.startsWith("ja")) return "ja";
  if (
    tag.startsWith("zh-tw") ||
    tag.startsWith("zh-hk") ||
    tag.startsWith("zh-hant")
  )
    return "zh-TW";
  if (tag.startsWith("es")) return "es";
  if (tag.startsWith("pt")) return "pt-BR";
  if (tag.startsWith("de")) return "de";
  if (tag.startsWith("fr")) return "fr";
  if (tag.startsWith("en")) return "en";
  return undefined;
}

export function localeFromAcceptLanguage(
  value: string | null | undefined,
): AppLocale | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));
      const parsedQuality =
        quality === undefined ? 1 : Number(quality.slice(2));
      return {
        tag,
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
      };
    })
    .sort((left, right) => right.quality - left.quality)
    .map(({ tag }) => localeFromLanguageTag(tag))
    .find((locale): locale is AppLocale => locale !== undefined);
}

export function localeFromCountry(
  value: string | null | undefined,
): AppLocale | undefined {
  switch (value?.trim().toUpperCase()) {
    case "KR":
      return "ko";
    case "JP":
      return "ja";
    case "TW":
    case "HK":
    case "MO":
      return "zh-TW";
    case "ES":
    case "MX":
    case "AR":
    case "BO":
    case "CL":
    case "CO":
    case "CR":
    case "CU":
    case "DO":
    case "EC":
    case "GT":
    case "HN":
    case "NI":
    case "PA":
    case "PE":
    case "PR":
    case "PY":
    case "SV":
    case "UY":
    case "VE":
      return "es";
    case "BR":
    case "PT":
      return "pt-BR";
    case "DE":
    case "AT":
    case "LI":
      return "de";
    case "FR":
    case "BE":
    case "MC":
      return "fr";
    default:
      return undefined;
  }
}

export function resolveRequestLocale(input: {
  readonly storedLocale?: string | null | undefined;
  readonly acceptLanguage?: string | null | undefined;
  readonly country?: string | null | undefined;
}): AppLocale {
  return isLocale(input.storedLocale)
    ? input.storedLocale
    : (localeFromAcceptLanguage(input.acceptLanguage) ??
        localeFromCountry(input.country) ??
        DEFAULT_LOCALE);
}

export function intlLocale(locale: AppLocale): string {
  return localeDetails[locale].intl;
}

/** Parses a supported application locale without collapsing it to report storage languages. */
export function appLocaleFromValue(value: unknown): AppLocale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export type UiMessages = Readonly<
  { readonly en: string } & Partial<Record<Exclude<AppLocale, "en">, string>>
>;

/** Returns a native UI string when available and English for any missing key. */
export function uiMessage(locale: AppLocale, messages: UiMessages): string {
  return messages[locale] ?? messages.en;
}

/** Existing audited research artifacts remain bilingual until translated projections are persisted. */
export type ResearchLocale = "en" | "ko";

export function researchLocale(locale: AppLocale): ResearchLocale {
  return locale === "ko" ? "ko" : "en";
}

/** Parses a UI locale and falls back to English for bilingual report content. */
export function researchLocaleFromValue(value: unknown): ResearchLocale {
  return isLocale(value) ? researchLocale(value) : "en";
}

export type ResearchCopy = {
  readonly camera: {
    readonly overview: string;
    readonly focus: string;
    readonly overviewToggle: string;
    readonly focusToggle: string;
  };
  readonly aria: {
    readonly stage: string;
    readonly semanticSummary: string;
  };
  readonly activityStatus: Readonly<Record<ActiveResearchActivityKind, string>>;
  readonly agentThinking: Readonly<Record<AgentId, string>>;
};

export const researchCopy: Readonly<Record<AppLocale, ResearchCopy>> = {
  en: {
    camera: {
      overview: "Overview",
      focus: "Focus",
      overviewToggle: "Show full office overview",
      focusToggle: "Follow the active research group",
    },
    aria: {
      stage: "AI research team activity",
      semanticSummary: "Current public office activity",
    },
    activityStatus: {
      data_collection: "Collecting data",
      macro_analysis: "Analyzing market conditions",
      news_analysis: "Analyzing news",
      market_comparison: "Comparing peers",
      business_analysis: "Analyzing the business",
      product_analysis: "Analyzing products",
      competition_analysis: "Analyzing competition",
      financial_analysis: "Analyzing financials",
      valuation_analysis: "Analyzing valuation",
      earnings_quality_analysis: "Testing earnings quality",
      downside_analysis: "Analyzing downside risk",
      policy_scenario_analysis: "Analyzing policy scenarios",
      team_synthesis: "Synthesizing team views",
      challenge_review: "Testing the countercase",
      followup_research: "Researching follow-ups",
      response_review: "Reviewing rebuttals",
      evidence_audit: "Auditing evidence",
      semantic_audit: "Validating claims",
      chair_synthesis: "Finalizing the decision",
    },
    agentThinking: {
      market: "Interpreting rates, inflation, and the market regime",
      market_news: "Cross-checking news flow, trend, and volume",
      benchmark: "Comparing peers and benchmark dispersion",
      company: "Mapping the business model and growth drivers",
      company_product: "Testing product adoption evidence",
      company_competition: "Comparing moat and competitive position",
      financial: "Reconciling statements and cash conversion",
      valuation: "Building valuation and expectation scenarios",
      financial_quality: "Testing earnings quality and durability",
      risk: "Tracing downside paths and early warnings",
      risk_policy: "Stress-testing policy and regulatory scenarios",
      chair: "Coordinating the evidence review",
    },
  },
  ko: {
    camera: {
      overview: "전체 보기",
      focus: "집중 보기",
      overviewToggle: "오피스 전체 보기",
      focusToggle: "현재 연구 그룹 따라가기",
    },
    aria: {
      stage: "AI 분석팀 작업 현황",
      semanticSummary: "현재 공개 오피스 활동",
    },
    activityStatus: {
      data_collection: "데이터 수집 중",
      macro_analysis: "시장 환경 분석 중",
      news_analysis: "뉴스 분석 중",
      market_comparison: "동종기업 비교 중",
      business_analysis: "사업 분석 중",
      product_analysis: "제품 분석 중",
      competition_analysis: "경쟁력 분석 중",
      financial_analysis: "재무 분석 중",
      valuation_analysis: "가치평가 중",
      earnings_quality_analysis: "이익의 질 검증 중",
      downside_analysis: "하방 위험 분석 중",
      policy_scenario_analysis: "정책 시나리오 분석 중",
      team_synthesis: "팀 의견 종합 중",
      challenge_review: "반대 논리 검토 중",
      followup_research: "추가 근거 조사 중",
      response_review: "반론 답변 검토 중",
      evidence_audit: "근거 감사 중",
      semantic_audit: "주장 검증 중",
      chair_synthesis: "최종 판단 중",
    },
    agentThinking: {
      market: "금리·물가와 시장 국면 해석 중",
      market_news: "뉴스 흐름과 추세·거래량 대조 중",
      benchmark: "동종기업과 벤치마크 편차 비교 중",
      company: "사업 구조와 성장 동력 분석 중",
      company_product: "제품 채택 근거 검증 중",
      company_competition: "경쟁우위와 시장 지위 비교 중",
      financial: "재무제표와 현금 전환 대조 중",
      valuation: "가치평가와 기대 시나리오 구성 중",
      financial_quality: "이익의 질과 지속성 검증 중",
      risk: "하방 경로와 조기 경보 추적 중",
      risk_policy: "정책·규제 시나리오 스트레스 테스트 중",
      chair: "근거 검토 절차 조율 중",
    },
  },
  ja: {
    camera: {
      overview: "全体表示",
      focus: "フォーカス",
      overviewToggle: "オフィス全体を表示",
      focusToggle: "進行中のリサーチ班を追跡",
    },
    aria: {
      stage: "AIリサーチチームの稼働状況",
      semanticSummary: "現在の公開オフィス活動",
    },
    activityStatus: {
      data_collection: "データを収集中",
      macro_analysis: "市場環境を分析中",
      news_analysis: "ニュースを分析中",
      market_comparison: "同業他社を比較中",
      business_analysis: "事業を分析中",
      product_analysis: "製品を分析中",
      competition_analysis: "競争力を分析中",
      financial_analysis: "財務を分析中",
      valuation_analysis: "バリュエーションを分析中",
      earnings_quality_analysis: "利益の質を検証中",
      downside_analysis: "下振れリスクを分析中",
      policy_scenario_analysis: "政策シナリオを分析中",
      team_synthesis: "チーム見解を統合中",
      challenge_review: "反対論を検証中",
      followup_research: "追加調査中",
      response_review: "反論への回答を確認中",
      evidence_audit: "根拠を監査中",
      semantic_audit: "主張を検証中",
      chair_synthesis: "最終判断を作成中",
    },
    agentThinking: {
      market: "金利・インフレと市場局面を分析中",
      market_news: "ニュース、トレンド、出来高を照合中",
      benchmark: "同業他社とベンチマークを比較中",
      company: "事業モデルと成長要因を分析中",
      company_product: "製品採用の根拠を検証中",
      company_competition: "競争優位と市場地位を比較中",
      financial: "財務諸表とキャッシュ転換を照合中",
      valuation: "バリュエーションと期待シナリオを作成中",
      financial_quality: "利益の質と持続性を検証中",
      risk: "下振れ経路と警戒指標を追跡中",
      risk_policy: "政策・規制シナリオをストレステスト中",
      chair: "根拠レビューを調整中",
    },
  },
  "zh-TW": {
    camera: {
      overview: "總覽",
      focus: "聚焦",
      overviewToggle: "查看完整研究室",
      focusToggle: "跟隨目前研究小組",
    },
    aria: { stage: "AI 研究團隊進度", semanticSummary: "目前公開研究室動態" },
    activityStatus: {
      data_collection: "正在蒐集資料",
      macro_analysis: "正在分析市場環境",
      news_analysis: "正在分析新聞",
      market_comparison: "正在比較同業",
      business_analysis: "正在分析業務",
      product_analysis: "正在分析產品",
      competition_analysis: "正在分析競爭力",
      financial_analysis: "正在分析財務",
      valuation_analysis: "正在分析估值",
      earnings_quality_analysis: "正在檢驗獲利品質",
      downside_analysis: "正在分析下行風險",
      policy_scenario_analysis: "正在分析政策情境",
      team_synthesis: "正在整合團隊觀點",
      challenge_review: "正在檢驗反方論點",
      followup_research: "正在追加研究",
      response_review: "正在檢視反駁回應",
      evidence_audit: "正在稽核證據",
      semantic_audit: "正在驗證主張",
      chair_synthesis: "正在完成最終判斷",
    },
    agentThinking: {
      market: "正在解讀利率、通膨與市場階段",
      market_news: "正在交叉核對新聞、趨勢與成交量",
      benchmark: "正在比較同業與基準差異",
      company: "正在分析商業模式與成長動能",
      company_product: "正在驗證產品採用證據",
      company_competition: "正在比較護城河與競爭地位",
      financial: "正在核對財報與現金轉換",
      valuation: "正在建立估值與預期情境",
      financial_quality: "正在檢驗獲利品質與持續性",
      risk: "正在追蹤下行路徑與預警訊號",
      risk_policy: "正在壓力測試政策與監管情境",
      chair: "正在協調證據審查",
    },
  },
  es: {
    camera: {
      overview: "Vista general",
      focus: "Enfoque",
      overviewToggle: "Ver toda la oficina",
      focusToggle: "Seguir al equipo de investigación activo",
    },
    aria: {
      stage: "Actividad del equipo de investigación con IA",
      semanticSummary: "Actividad pública actual de la oficina",
    },
    activityStatus: {
      data_collection: "Recopilando datos",
      macro_analysis: "Analizando el entorno de mercado",
      news_analysis: "Analizando noticias",
      market_comparison: "Comparando empresas pares",
      business_analysis: "Analizando el negocio",
      product_analysis: "Analizando productos",
      competition_analysis: "Analizando la competencia",
      financial_analysis: "Analizando las finanzas",
      valuation_analysis: "Analizando la valoración",
      earnings_quality_analysis: "Evaluando la calidad de beneficios",
      downside_analysis: "Analizando el riesgo bajista",
      policy_scenario_analysis: "Analizando escenarios regulatorios",
      team_synthesis: "Integrando las perspectivas",
      challenge_review: "Evaluando la tesis contraria",
      followup_research: "Realizando investigación adicional",
      response_review: "Revisando las refutaciones",
      evidence_audit: "Auditando la evidencia",
      semantic_audit: "Validando las afirmaciones",
      chair_synthesis: "Finalizando la decisión",
    },
    agentThinking: {
      market: "Interpretando tasas, inflación y régimen de mercado",
      market_news: "Contrastando noticias, tendencia y volumen",
      benchmark: "Comparando pares y dispersión frente al índice",
      company: "Analizando el modelo de negocio y los motores de crecimiento",
      company_product: "Validando la adopción del producto",
      company_competition:
        "Comparando ventajas competitivas y posición de mercado",
      financial: "Conciliando estados financieros y conversión de caja",
      valuation: "Construyendo escenarios de valoración y expectativas",
      financial_quality: "Evaluando calidad y duración de beneficios",
      risk: "Trazando riesgos bajistas y alertas tempranas",
      risk_policy: "Probando escenarios regulatorios",
      chair: "Coordinando la revisión de evidencia",
    },
  },
  "pt-BR": {
    camera: {
      overview: "Visão geral",
      focus: "Foco",
      overviewToggle: "Ver todo o escritório",
      focusToggle: "Acompanhar a equipe de pesquisa ativa",
    },
    aria: {
      stage: "Atividade da equipe de pesquisa com IA",
      semanticSummary: "Atividade pública atual do escritório",
    },
    activityStatus: {
      data_collection: "Coletando dados",
      macro_analysis: "Analisando o ambiente de mercado",
      news_analysis: "Analisando notícias",
      market_comparison: "Comparando empresas pares",
      business_analysis: "Analisando o negócio",
      product_analysis: "Analisando produtos",
      competition_analysis: "Analisando a concorrência",
      financial_analysis: "Analisando as finanças",
      valuation_analysis: "Analisando o valuation",
      earnings_quality_analysis: "Testando a qualidade dos lucros",
      downside_analysis: "Analisando riscos de queda",
      policy_scenario_analysis: "Analisando cenários regulatórios",
      team_synthesis: "Consolidando as visões da equipe",
      challenge_review: "Testando a tese contrária",
      followup_research: "Fazendo pesquisa adicional",
      response_review: "Revisando as refutações",
      evidence_audit: "Auditando evidências",
      semantic_audit: "Validando as afirmações",
      chair_synthesis: "Finalizando a decisão",
    },
    agentThinking: {
      market: "Interpretando juros, inflação e regime de mercado",
      market_news: "Cruzando notícias, tendência e volume",
      benchmark: "Comparando pares e dispersão do benchmark",
      company: "Mapeando o modelo de negócio e os vetores de crescimento",
      company_product: "Validando evidências de adoção do produto",
      company_competition:
        "Comparando vantagem competitiva e posição de mercado",
      financial: "Conciliando demonstrações e conversão de caixa",
      valuation: "Construindo cenários de valuation e expectativas",
      financial_quality: "Testando a qualidade e a duração dos lucros",
      risk: "Mapeando riscos de queda e alertas antecipados",
      risk_policy: "Testando cenários regulatórios",
      chair: "Coordenando a revisão das evidências",
    },
  },
  de: {
    camera: {
      overview: "Übersicht",
      focus: "Fokus",
      overviewToggle: "Gesamtes Research-Büro anzeigen",
      focusToggle: "Aktivem Research-Team folgen",
    },
    aria: {
      stage: "Aktivität des KI-Research-Teams",
      semanticSummary: "Aktuelle öffentliche Büroaktivität",
    },
    activityStatus: {
      data_collection: "Daten werden gesammelt",
      macro_analysis: "Marktumfeld wird analysiert",
      news_analysis: "Nachrichten werden analysiert",
      market_comparison: "Vergleichsunternehmen werden geprüft",
      business_analysis: "Geschäft wird analysiert",
      product_analysis: "Produkte werden analysiert",
      competition_analysis: "Wettbewerb wird analysiert",
      financial_analysis: "Finanzdaten werden analysiert",
      valuation_analysis: "Bewertung wird analysiert",
      earnings_quality_analysis: "Ergebnisqualität wird geprüft",
      downside_analysis: "Abwärtsrisiko wird analysiert",
      policy_scenario_analysis: "Regulierungsszenarien werden analysiert",
      team_synthesis: "Teammeinungen werden zusammengeführt",
      challenge_review: "Gegenthese wird geprüft",
      followup_research: "Zusätzliche Recherche läuft",
      response_review: "Einwände werden geprüft",
      evidence_audit: "Belege werden auditiert",
      semantic_audit: "Aussagen werden validiert",
      chair_synthesis: "Entscheidung wird finalisiert",
    },
    agentThinking: {
      market: "Zinsen, Inflation und Marktregime werden eingeordnet",
      market_news: "Nachrichten, Trend und Volumen werden abgeglichen",
      benchmark: "Peers und Benchmark-Abweichungen werden verglichen",
      company: "Geschäftsmodell und Wachstumstreiber werden analysiert",
      company_product: "Produktakzeptanz wird geprüft",
      company_competition:
        "Wettbewerbsvorteile und Marktposition werden verglichen",
      financial: "Abschlüsse und Cash Conversion werden abgeglichen",
      valuation: "Bewertungs- und Erwartungsszenarien werden erstellt",
      financial_quality: "Ergebnisqualität und Beständigkeit werden geprüft",
      risk: "Abwärtspfade und Frühwarnsignale werden verfolgt",
      risk_policy: "Regulierungs- und Politikszenarien werden getestet",
      chair: "Evidenzprüfung wird koordiniert",
    },
  },
  fr: {
    camera: {
      overview: "Vue d’ensemble",
      focus: "Focus",
      overviewToggle: "Afficher tout le bureau",
      focusToggle: "Suivre l’équipe de recherche active",
    },
    aria: {
      stage: "Activité de l’équipe de recherche IA",
      semanticSummary: "Activité publique actuelle du bureau",
    },
    activityStatus: {
      data_collection: "Collecte des données",
      macro_analysis: "Analyse de l’environnement de marché",
      news_analysis: "Analyse des actualités",
      market_comparison: "Comparaison des sociétés comparables",
      business_analysis: "Analyse de l’activité",
      product_analysis: "Analyse des produits",
      competition_analysis: "Analyse de la concurrence",
      financial_analysis: "Analyse financière",
      valuation_analysis: "Analyse de la valorisation",
      earnings_quality_analysis: "Évaluation de la qualité des résultats",
      downside_analysis: "Analyse du risque baissier",
      policy_scenario_analysis: "Analyse des scénarios réglementaires",
      team_synthesis: "Synthèse des avis de l’équipe",
      challenge_review: "Test de la thèse opposée",
      followup_research: "Recherche complémentaire",
      response_review: "Examen des réfutations",
      evidence_audit: "Audit des preuves",
      semantic_audit: "Validation des affirmations",
      chair_synthesis: "Finalisation de la décision",
    },
    agentThinking: {
      market: "Interprétation des taux, de l’inflation et du régime de marché",
      market_news: "Recoupement des actualités, de la tendance et des volumes",
      benchmark: "Comparaison des pairs et des écarts à l’indice",
      company: "Analyse du modèle économique et des moteurs de croissance",
      company_product: "Validation des preuves d’adoption produit",
      company_competition:
        "Comparaison de l’avantage concurrentiel et du positionnement",
      financial: "Rapprochement des comptes et de la conversion en trésorerie",
      valuation: "Construction de scénarios de valorisation et d’anticipations",
      financial_quality:
        "Évaluation de la qualité et de la durabilité des résultats",
      risk: "Analyse des scénarios baissiers et des signaux d’alerte",
      risk_policy: "Test des scénarios réglementaires",
      chair: "Coordination de la revue des preuves",
    },
  },
};

type Copy = {
  readonly a11y: {
    readonly home: string;
    readonly language: string;
    readonly navigation: string;
    readonly results: string;
  };
  readonly nav: {
    readonly product: string;
    readonly getStarted: string;
    readonly pricing: string;
  };
  readonly hero: {
    readonly eyebrow: string;
    readonly titleLead: string;
    readonly titleTail: string;
    readonly descriptionLead: string;
    readonly descriptionTail: string;
    readonly proof: string;
  };
  readonly landing: {
    readonly explainer: {
      readonly eyebrow: string;
      readonly title: string;
      readonly cards: readonly {
        readonly title: string;
        readonly body: string;
      }[];
    };
    readonly office: {
      readonly headline: string;
      readonly description: string;
      readonly live: string;
      readonly active: (count: number) => string;
      readonly loading: string;
      readonly label: string;
      readonly error: string;
    };
    readonly researchRoom: {
      readonly questionLabel: string;
      readonly eyebrow: string;
      readonly title: string;
      readonly description: string;
      readonly browse: string;
      readonly fullCommittee: string;
      readonly teams: Readonly<
        Record<"market" | "company" | "financial" | "risk", string>
      >;
      readonly flip: string;
      readonly flipLabel: (symbol: string, question: string) => string;
      readonly locked: string;
      readonly open: string;
    };
    readonly publishedTime: {
      readonly justNow: string;
      readonly minutesAgo: (minutes: number) => string;
      readonly hoursMinutesAgo: (hours: number, minutes: number) => string;
    };
  };
  readonly footer: {
    readonly purpose: string;
    readonly productHeading: string;
    readonly howItWorks: string;
    readonly research: string;
    readonly stockAnalysis: string;
    readonly standardsHeading: string;
    readonly about: string;
    readonly methodology: string;
    readonly editorialPolicy: string;
    readonly corrections: string;
    readonly contactHeading: string;
    readonly support: string;
    readonly operator: string;
    readonly legalHeading: string;
    readonly terms: string;
    readonly privacy: string;
    readonly disclaimerLabel: string;
    readonly risk: string;
    readonly disclaimer: string;
    readonly rights: string;
  };
  readonly search: {
    readonly label: string;
    readonly placeholder: string;
    readonly questionLabel: string;
    readonly questionPlaceholder: string;
    readonly action: string;
    readonly loading: string;
    readonly popular: string;
    readonly clear: string;
    readonly noResults: string;
    readonly matchHint: string;
    readonly queued: (symbol: string) => string;
  };
};

export const copy: Readonly<Record<AppLocale, Copy>> = {
  en: {
    a11y: {
      home: "Stocksembly home",
      language: "Language",
      navigation: "Primary navigation",
      results: "Search results",
    },
    nav: {
      product: "Product",
      getStarted: "Get started",
      pricing: "Plans",
    },
    hero: {
      eyebrow: "AI research team for US stocks",
      titleLead: "Eleven AI analysts",
      titleTail: "debate one stock.",
      descriptionLead:
        "They investigate independently, challenge each other's findings, and hand you a research file with every source linked.",
      descriptionTail: "No buy or sell calls. No price targets.",
      proof: "Watch the debate, follow the sources, decide for yourself.",
    },
    landing: {
      explainer: {
        eyebrow: "WHAT YOU GET",
        title: "A research file, not a tip.",
        cards: [
          {
            title: "Sources attached",
            body: "Every claim links to the filing, call, or data it came from, so you can check it yourself.",
          },
          {
            title: "Disagreement stays visible",
            body: "When analysts don't agree, the file keeps both sides and says what would settle it.",
          },
          {
            title: "Easy mode for beginners",
            body: "Switch to plain-language explanations any time. The depth and the evidence stay the same.",
          },
        ],
      },
      office: {
        headline:
          "Watch eleven analysts and the chair work — and disagree — in real time",
        description:
          "Each analyst researches at their own desk, then the teams meet to challenge one another. Your research runs in this same office.",
        live: "Live research office",
        active: (count) => `${count} agents active`,
        loading: "Preparing the research office",
        label: "AI agent research office",
        error: "The research office could not be loaded.",
      },
      researchRoom: {
        questionLabel: "Question asked",
        eyebrow: "RESEARCH ROOM · LATEST FIVE",
        title: "Flip through questions investors already asked.",
        description:
          "Reveal the question on the back, then open the finished research.",
        browse: "Browse all research",
        fullCommittee: "Full committee",
        teams: {
          market: "Market team",
          company: "Company team",
          financial: "Financial team",
          risk: "Risk team",
        },
        flip: "Flip ↗",
        flipLabel: (symbol, question) =>
          `Flip ${symbol} research card: ${question}`,
        locked: "Opens in 7 days · View access",
        open: "Open research",
      },
      publishedTime: {
        justNow: "Just now",
        minutesAgo: (minutes) => `${minutes}m ago`,
        hoursMinutesAgo: (hours, minutes) =>
          `${hours}h${minutes > 0 ? ` ${minutes}m` : ""} ago`,
      },
    },
    footer: {
      purpose:
        "AI equity research that keeps sources attached and disagreement visible.",
      productHeading: "Product",
      howItWorks: "How it works",
      research: "Start research",
      stockAnalysis: "US stock analysis",
      standardsHeading: "About & standards",
      about: "About Stocksembly",
      methodology: "Research methodology",
      editorialPolicy: "Editorial policy",
      corrections: "Corrections policy",
      contactHeading: "Contact",
      support: "Customer support",
      operator: "Operated by SERN · South Korea",
      legalHeading: "Legal",
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      disclaimerLabel: "Research Disclaimer",
      risk: "Risk Disclosure",
      disclaimer:
        "AI-assisted research for informational and educational use. No buy or sell recommendations or target prices. Data and model outputs may be delayed, incomplete, or inaccurate. Investing involves risk, including loss of principal.",
      rights: "SERN. All rights reserved.",
    },
    search: {
      label: "Ticker or company",
      placeholder: "Search a US ticker or company",
      questionLabel: "Investment question",
      questionPlaceholder: "e.g. Can growth justify today's valuation?",
      action: "Build research",
      loading: "Opening research room",
      popular: "Popular tickers",
      clear: "Clear search",
      noResults: "No supported US company found. Try another ticker.",
      matchHint: "Select a company or start the research directly.",
      queued: (symbol) => `${symbol} research room is ready.`,
    },
  },
  ko: {
    a11y: {
      home: "Stocksembly 홈",
      language: "언어",
      navigation: "주요 탐색",
      results: "검색 결과",
    },
    nav: {
      product: "제품",
      getStarted: "시작하기",
      pricing: "요금제",
    },
    hero: {
      eyebrow: "미국주식 AI 리서치 팀",
      titleLead: "AI 분석가 11명이",
      titleTail: "한 종목을 토론합니다.",
      descriptionLead:
        "각자 조사한 결과를 서로 반박하고, 출처가 링크된 리서치 파일로 정리합니다.",
      descriptionTail: "매매 추천도, 목표가도 없습니다.",
      proof: "토론을 지켜보고, 출처를 따라가고, 판단은 직접 하세요.",
    },
    landing: {
      explainer: {
        eyebrow: "무엇을 받게 되나요",
        title: "추천이 아니라 리서치 파일입니다.",
        cards: [
          {
            title: "출처가 붙어 있습니다",
            body: "모든 주장은 근거가 된 공시·실적 발표·데이터로 연결돼 직접 확인할 수 있습니다.",
          },
          {
            title: "반론이 그대로 남습니다",
            body: "분석가들의 의견이 갈리면 양쪽 주장과 무엇으로 판가름 나는지를 함께 기록합니다.",
          },
          {
            title: "초보자용 쉬운 설명",
            body: "언제든 쉬운 말로 바꿔 볼 수 있습니다. 분석 깊이와 근거는 그대로입니다.",
          },
        ],
      },
      office: {
        headline: "분석가 11명과 의장이 조사하고 반박하는 과정을 그대로 봅니다",
        description:
          "각자 자리에서 조사한 뒤 팀 테이블에 모여 서로의 결론에 반론을 제기합니다. 실제 리서치도 이 오피스에서 똑같이 진행됩니다.",
        live: "실시간 리서치 오피스",
        active: (count) => `${count}개 에이전트 활동 중`,
        loading: "리서치 오피스를 준비하고 있습니다",
        label: "AI 에이전트 리서치 오피스",
        error: "리서치 오피스를 불러오지 못했습니다.",
      },
      researchRoom: {
        questionLabel: "받은 질문",
        eyebrow: "RESEARCH ROOM · 최근 5개",
        title: "다른 투자자의 질문을 뒤집어 보세요.",
        description:
          "카드 뒷면에서 질문을 확인하고, 완성된 리서치로 바로 이동합니다.",
        browse: "모든 리서치 보기",
        fullCommittee: "전체 위원회",
        teams: {
          market: "시장팀",
          company: "기업팀",
          financial: "재무팀",
          risk: "리스크팀",
        },
        flip: "뒤집기 ↗",
        flipLabel: (symbol, question) =>
          `${symbol} 리서치 카드 뒤집기: ${question}`,
        locked: "7일 후 공개 · 클릭하여 안내",
        open: "리서치 열기",
      },
      publishedTime: {
        justNow: "방금 전",
        minutesAgo: (minutes) => `${minutes}분 전`,
        hoursMinutesAgo: (hours, minutes) =>
          `${hours}시간${minutes > 0 ? ` ${minutes}분` : ""} 전`,
      },
    },
    footer: {
      purpose: "출처는 붙이고 의견 차이는 남기는 AI 주식 리서치.",
      productHeading: "제품",
      howItWorks: "작동 방식",
      research: "리서치 시작",
      stockAnalysis: "미국주식 분석",
      standardsHeading: "소개 및 원칙",
      about: "Stocksembly 소개",
      methodology: "리서치 방법론",
      editorialPolicy: "편집 원칙",
      corrections: "정정 정책",
      contactHeading: "문의",
      support: "고객 문의",
      operator: "SERN 운영 · 대한민국",
      legalHeading: "법률",
      terms: "이용약관",
      privacy: "개인정보처리방침",
      disclaimerLabel: "리서치 면책",
      risk: "위험 고지",
      disclaimer:
        "정보 및 교육 목적의 AI 보조 리서치입니다. 매매 추천이나 목표가를 제공하지 않으며 데이터와 모델 결과는 지연되거나 부정확할 수 있습니다. 투자에는 원금 손실 위험이 있습니다.",
      rights: "SERN. All rights reserved.",
    },
    search: {
      label: "종목 또는 기업",
      placeholder: "미국 티커 또는 기업명 검색",
      questionLabel: "검증할 투자 질문",
      questionPlaceholder: "예: 성장률이 현재 밸류에이션을 정당화할까?",
      action: "팀 리서치 시작",
      loading: "리서치 룸을 준비하고 있습니다",
      popular: "인기 티커",
      clear: "검색어 지우기",
      noResults:
        "지원 대상인 미국 기업을 찾지 못했습니다. 다른 티커를 입력하세요.",
      matchHint: "기업을 선택하거나 바로 리서치를 시작하세요.",
      queued: (symbol) => `${symbol} 리서치 룸이 준비됐습니다.`,
    },
  },
  ja: {
    a11y: {
      home: "Stocksembly ホーム",
      language: "言語",
      navigation: "メインナビゲーション",
      results: "検索結果",
    },
    nav: { product: "製品", getStarted: "始める", pricing: "料金プラン" },
    hero: {
      eyebrow: "米国株AIリサーチチーム",
      titleLead: "11人のAIアナリストが",
      titleTail: "1銘柄を討論します。",
      descriptionLead:
        "それぞれが独自に調査し、互いの結論に反論し、出典がリンクされたリサーチファイルにまとめます。",
      descriptionTail: "売買の推奨も目標株価もありません。",
      proof: "議論を見て、出典をたどり、判断はご自身で。",
    },
    landing: {
      explainer: {
        eyebrow: "得られるもの",
        title: "推奨ではなく、リサーチファイル。",
        cards: [
          {
            title: "出典が付いています",
            body: "すべての主張は根拠となった開示・決算説明・データにリンクされ、ご自身で確認できます。",
          },
          {
            title: "反論がそのまま残ります",
            body: "アナリストの意見が分かれた場合、両方の主張と決着の条件を記録します。",
          },
          {
            title: "初心者向けのやさしい説明",
            body: "いつでも平易な説明に切り替えられます。分析の深さと根拠は変わりません。",
          },
        ],
      },
      office: {
        headline:
          "11人のアナリストと議長が調査し、反論し合う様子をリアルタイムで",
        description:
          "各自の席で調査した後、チームで集まって互いの結論を検証します。実際のリサーチもこのオフィスで同じように進みます。",
        live: "リアルタイム・リサーチオフィス",
        active: (count) => `${count}人のエージェントが稼働中`,
        loading: "リサーチオフィスを準備しています",
        label: "AIエージェント・リサーチオフィス",
        error: "リサーチオフィスを読み込めませんでした。",
      },
      researchRoom: {
        questionLabel: "受け取った質問",
        eyebrow: "RESEARCH ROOM · 最新5件",
        title: "投資家がすでに尋ねた論点をめくってみましょう。",
        description: "裏面で質問を確認し、完成したリサーチを開けます。",
        browse: "すべてのリサーチを見る",
        fullCommittee: "全委員会",
        teams: {
          market: "市場チーム",
          company: "企業チーム",
          financial: "財務チーム",
          risk: "リスクチーム",
        },
        flip: "めくる ↗",
        flipLabel: (symbol, question) =>
          `${symbol}のリサーチカードをめくる：${question}`,
        locked: "7日後に公開 · 閲覧条件",
        open: "リサーチを開く",
      },
      publishedTime: {
        justNow: "たった今",
        minutesAgo: (minutes) => `${minutes}分前`,
        hoursMinutesAgo: (hours, minutes) =>
          `${hours}時間${minutes > 0 ? `${minutes}分` : ""}前`,
      },
    },
    footer: {
      purpose: "出典を保ち、意見の相違を可視化するAI株式リサーチ。",
      productHeading: "製品",
      howItWorks: "仕組み",
      research: "リサーチを開始",
      stockAnalysis: "米国株分析",
      standardsHeading: "会社情報・基準",
      about: "Stocksemblyについて",
      methodology: "リサーチ手法",
      editorialPolicy: "編集方針",
      corrections: "訂正方針",
      contactHeading: "お問い合わせ",
      support: "カスタマーサポート",
      operator: "SERN運営 · 韓国",
      legalHeading: "法的情報",
      terms: "利用規約",
      privacy: "プライバシーポリシー",
      disclaimerLabel: "リサーチ免責事項",
      risk: "リスク開示",
      disclaimer:
        "情報・教育目的のAI支援リサーチです。売買推奨や目標株価ではありません。データやモデル出力は遅延、不完全、または不正確な場合があります。投資には元本割れのリスクがあります。",
      rights: "SERN. All rights reserved.",
    },
    search: {
      label: "ティッカーまたは企業",
      placeholder: "米国株のティッカーまたは企業名を検索",
      questionLabel: "検証する投資質問",
      questionPlaceholder:
        "例：成長率は現在のバリュエーションを正当化できるか？",
      action: "チームリサーチを開始",
      loading: "リサーチルームを準備中",
      popular: "人気のティッカー",
      clear: "検索をクリア",
      noResults:
        "対応する米国企業が見つかりません。別のティッカーを入力してください。",
      matchHint: "企業を選択するか、そのままリサーチを開始してください。",
      queued: (symbol) => `${symbol} のリサーチルームを用意しました。`,
    },
  },
  "zh-TW": {
    a11y: {
      home: "Stocksembly 首頁",
      language: "語言",
      navigation: "主要導覽",
      results: "搜尋結果",
    },
    nav: { product: "產品", getStarted: "開始使用", pricing: "方案" },
    hero: {
      eyebrow: "美股 AI 研究團隊",
      titleLead: "11 位 AI 分析師",
      titleTail: "討論同一檔股票。",
      descriptionLead:
        "他們各自獨立調查、互相質疑結論，並交付每項來源皆附連結的研究檔案。",
      descriptionTail: "沒有買賣建議，也沒有目標價。",
      proof: "看完辯論、追蹤來源，再自行判斷。",
    },
    landing: {
      explainer: {
        eyebrow: "您會得到什麼",
        title: "是研究檔案，不是明牌。",
        cards: [
          {
            title: "附上來源",
            body: "每項主張都連結到其依據的申報文件、法說會或資料，您可以自行查證。",
          },
          {
            title: "保留分歧",
            body: "分析師意見不一致時，檔案會同時保留雙方主張，並說明如何判定。",
          },
          {
            title: "新手友善的簡易模式",
            body: "隨時可切換為淺白說明，分析深度與證據維持不變。",
          },
        ],
      },
      office: {
        headline: "即時觀看 11 位分析師與主席調查與交鋒",
        description:
          "每位分析師先在自己的座位調查，再由團隊集合互相質疑結論。您的研究也在同一間辦公室進行。",
        live: "即時研究辦公室",
        active: (count) => `${count} 位代理正在運作`,
        loading: "正在準備研究辦公室",
        label: "AI 代理研究辦公室",
        error: "無法載入研究辦公室。",
      },
      researchRoom: {
        questionLabel: "收到的問題",
        eyebrow: "RESEARCH ROOM · 最新 5 份",
        title: "翻閱其他投資人已經提出的問題。",
        description: "翻到背面查看問題，再開啟完整研究。",
        browse: "瀏覽所有研究",
        fullCommittee: "全體委員會",
        teams: {
          market: "市場團隊",
          company: "企業團隊",
          financial: "財務團隊",
          risk: "風險團隊",
        },
        flip: "翻面 ↗",
        flipLabel: (symbol, question) => `翻開 ${symbol} 研究卡：${question}`,
        locked: "7 天後開放 · 查看權限",
        open: "開啟研究",
      },
      publishedTime: {
        justNow: "剛剛",
        minutesAgo: (minutes) => `${minutes} 分鐘前`,
        hoursMinutesAgo: (hours, minutes) =>
          `${hours} 小時${minutes > 0 ? ` ${minutes} 分鐘` : ""}前`,
      },
    },
    footer: {
      purpose: "保留來源並呈現分歧的 AI 股票研究。",
      productHeading: "產品",
      howItWorks: "運作方式",
      research: "開始研究",
      stockAnalysis: "美股分析",
      standardsHeading: "關於與標準",
      about: "關於 Stocksembly",
      methodology: "研究方法",
      editorialPolicy: "編輯政策",
      corrections: "更正政策",
      contactHeading: "聯絡我們",
      support: "客戶支援",
      operator: "由 SERN 營運 · 韓國",
      legalHeading: "法律資訊",
      terms: "服務條款",
      privacy: "隱私權政策",
      disclaimerLabel: "研究免責聲明",
      risk: "風險揭露",
      disclaimer:
        "本服務為資訊與教育用途的 AI 輔助研究，不提供買賣建議或目標價。資料與模型輸出可能延遲、不完整或不準確。投資可能導致本金損失。",
      rights: "SERN. All rights reserved.",
    },
    search: {
      label: "股票代號或公司",
      placeholder: "搜尋美股代號或公司名稱",
      questionLabel: "要驗證的投資問題",
      questionPlaceholder: "例如：成長能否合理化目前估值？",
      action: "開始團隊研究",
      loading: "正在準備研究室",
      popular: "熱門股票",
      clear: "清除搜尋",
      noResults: "找不到支援的美國公司，請嘗試其他股票代號。",
      matchHint: "選擇公司，或直接開始研究。",
      queued: (symbol) => `${symbol} 研究室已準備完成。`,
    },
  },
  es: {
    a11y: {
      home: "Inicio de Stocksembly",
      language: "Idioma",
      navigation: "Navegación principal",
      results: "Resultados de búsqueda",
    },
    nav: { product: "Producto", getStarted: "Comenzar", pricing: "Planes" },
    hero: {
      eyebrow: "Investigación con IA de acciones de EE. UU.",
      titleLead: "Once analistas de IA",
      titleTail: "debaten una acción.",
      descriptionLead:
        "Investigan por separado, cuestionan sus hallazgos y te entregan un archivo de investigación con cada fuente enlazada.",
      descriptionTail: "Sin recomendaciones ni precios objetivo.",
      proof: "Sigue el debate, revisa las fuentes y decide por tu cuenta.",
    },
    landing: {
      explainer: {
        eyebrow: "QUÉ OBTIENES",
        title: "Un archivo de investigación, no un consejo.",
        cards: [
          {
            title: "Fuentes adjuntas",
            body: "Cada afirmación enlaza al informe, la conferencia o los datos de origen para que puedas comprobarla.",
          },
          {
            title: "El desacuerdo queda visible",
            body: "Si los analistas no coinciden, el archivo conserva ambas posturas e indica qué lo resolvería.",
          },
          {
            title: "Modo sencillo para principiantes",
            body: "Cambia a explicaciones en lenguaje claro cuando quieras. La profundidad y la evidencia no cambian.",
          },
        ],
      },
      office: {
        headline:
          "Mira a once analistas y al presidente trabajar, y discrepar, en tiempo real",
        description:
          "Cada analista investiga en su escritorio y luego los equipos se reúnen para cuestionarse. Tu investigación se realiza en esta misma oficina.",
        live: "Oficina de análisis en vivo",
        active: (count) => `${count} agentes activos`,
        loading: "Preparando la oficina de análisis",
        label: "Oficina de análisis con agentes de IA",
        error: "No se pudo cargar la oficina de análisis.",
      },
      researchRoom: {
        questionLabel: "Pregunta recibida",
        eyebrow: "RESEARCH ROOM · ÚLTIMOS CINCO",
        title: "Descubre las preguntas que otros inversores ya hicieron.",
        description:
          "Voltea la tarjeta, lee la pregunta y abre el análisis completo.",
        browse: "Ver todos los análisis",
        fullCommittee: "Comité completo",
        teams: {
          market: "Equipo de mercado",
          company: "Equipo de empresa",
          financial: "Equipo financiero",
          risk: "Equipo de riesgos",
        },
        flip: "Voltear ↗",
        flipLabel: (symbol, question) =>
          `Voltear la tarjeta de ${symbol}: ${question}`,
        locked: "Disponible en 7 días · Ver acceso",
        open: "Abrir análisis",
      },
      publishedTime: {
        justNow: "Ahora",
        minutesAgo: (minutes) => `Hace ${minutes} min`,
        hoursMinutesAgo: (hours, minutes) =>
          `Hace ${hours} h${minutes > 0 ? ` ${minutes} min` : ""}`,
      },
    },
    footer: {
      purpose:
        "Análisis bursátil con IA que conserva las fuentes y muestra los desacuerdos.",
      productHeading: "Producto",
      howItWorks: "Cómo funciona",
      research: "Iniciar análisis",
      stockAnalysis: "Análisis de acciones de EE. UU.",
      standardsHeading: "Información y estándares",
      about: "Sobre Stocksembly",
      methodology: "Metodología",
      editorialPolicy: "Política editorial",
      corrections: "Política de correcciones",
      contactHeading: "Contacto",
      support: "Atención al cliente",
      operator: "Operado por SERN · Corea del Sur",
      legalHeading: "Legal",
      terms: "Términos del servicio",
      privacy: "Política de privacidad",
      disclaimerLabel: "Aviso de investigación",
      risk: "Divulgación de riesgos",
      disclaimer:
        "Análisis asistido por IA con fines informativos y educativos. No constituye recomendación de compra o venta ni precio objetivo. Los datos y resultados pueden ser tardíos, incompletos o inexactos. Invertir implica riesgo de pérdida del capital.",
      rights: "SERN. Todos los derechos reservados.",
    },
    search: {
      label: "Ticker o empresa",
      placeholder: "Busca un ticker o empresa de EE. UU.",
      questionLabel: "Pregunta de inversión",
      questionPlaceholder:
        "Ej.: ¿El crecimiento justifica la valoración actual?",
      action: "Iniciar análisis en equipo",
      loading: "Preparando la sala de análisis",
      popular: "Tickers populares",
      clear: "Borrar búsqueda",
      noResults:
        "No encontramos una empresa estadounidense compatible. Prueba otro ticker.",
      matchHint: "Selecciona una empresa o inicia el análisis directamente.",
      queued: (symbol) => `La sala de análisis de ${symbol} está lista.`,
    },
  },
  "pt-BR": {
    a11y: {
      home: "Início da Stocksembly",
      language: "Idioma",
      navigation: "Navegação principal",
      results: "Resultados da busca",
    },
    nav: { product: "Produto", getStarted: "Começar", pricing: "Planos" },
    hero: {
      eyebrow: "Pesquisa com IA para ações dos EUA",
      titleLead: "Onze analistas de IA",
      titleTail: "debatem uma ação.",
      descriptionLead:
        "Eles investigam separadamente, contestam uns aos outros e entregam um arquivo de pesquisa com todas as fontes ligadas.",
      descriptionTail: "Sem recomendações nem preços-alvo.",
      proof:
        "Acompanhe o debate, confira as fontes e decida por conta própria.",
    },
    landing: {
      explainer: {
        eyebrow: "O QUE VOCÊ RECEBE",
        title: "Um arquivo de pesquisa, não uma dica.",
        cards: [
          {
            title: "Fontes anexadas",
            body: "Cada afirmação leva ao documento, à teleconferência ou aos dados de origem, para você conferir.",
          },
          {
            title: "A divergência fica visível",
            body: "Quando os analistas discordam, o arquivo mantém os dois lados e diz o que resolveria a questão.",
          },
          {
            title: "Modo fácil para iniciantes",
            body: "Troque para explicações em linguagem simples quando quiser. A profundidade e as evidências continuam iguais.",
          },
        ],
      },
      office: {
        headline:
          "Veja onze analistas e o presidente trabalhando, e discordando, em tempo real",
        description:
          "Cada analista pesquisa em sua mesa e depois as equipes se reúnem para questionar umas às outras. Sua pesquisa roda neste mesmo escritório.",
        live: "Escritório de research ao vivo",
        active: (count) => `${count} agentes ativos`,
        loading: "Preparando o escritório de research",
        label: "Escritório de research com agentes de IA",
        error: "Não foi possível carregar o escritório de research.",
      },
      researchRoom: {
        questionLabel: "Pergunta recebida",
        eyebrow: "RESEARCH ROOM · CINCO MAIS RECENTES",
        title: "Veja as perguntas que outros investidores já fizeram.",
        description:
          "Vire o cartão, confira a pergunta e abra o research completo.",
        browse: "Ver todos os researchs",
        fullCommittee: "Comitê completo",
        teams: {
          market: "Equipe de mercado",
          company: "Equipe de empresa",
          financial: "Equipe financeira",
          risk: "Equipe de riscos",
        },
        flip: "Virar ↗",
        flipLabel: (symbol, question) =>
          `Virar o cartão de ${symbol}: ${question}`,
        locked: "Disponível em 7 dias · Ver acesso",
        open: "Abrir research",
      },
      publishedTime: {
        justNow: "Agora",
        minutesAgo: (minutes) => `Há ${minutes} min`,
        hoursMinutesAgo: (hours, minutes) =>
          `Há ${hours} h${minutes > 0 ? ` ${minutes} min` : ""}`,
      },
    },
    footer: {
      purpose:
        "Research de ações com IA que preserva as fontes e mostra as divergências.",
      productHeading: "Produto",
      howItWorks: "Como funciona",
      research: "Iniciar research",
      stockAnalysis: "Análise de ações dos EUA",
      standardsHeading: "Sobre e padrões",
      about: "Sobre a Stocksembly",
      methodology: "Metodologia",
      editorialPolicy: "Política editorial",
      corrections: "Política de correções",
      contactHeading: "Contato",
      support: "Atendimento",
      operator: "Operado pela SERN · Coreia do Sul",
      legalHeading: "Legal",
      terms: "Termos de Serviço",
      privacy: "Política de Privacidade",
      disclaimerLabel: "Aviso de research",
      risk: "Divulgação de riscos",
      disclaimer:
        "Research assistido por IA para fins informativos e educacionais. Não constitui recomendação de compra ou venda nem preço-alvo. Dados e resultados podem estar atrasados, incompletos ou incorretos. Investir envolve risco de perda do capital.",
      rights: "SERN. Todos os direitos reservados.",
    },
    search: {
      label: "Ticker ou empresa",
      placeholder: "Busque um ticker ou empresa dos EUA",
      questionLabel: "Pergunta de investimento",
      questionPlaceholder: "Ex.: o crescimento justifica o valuation atual?",
      action: "Iniciar research em equipe",
      loading: "Preparando a sala de research",
      popular: "Tickers populares",
      clear: "Limpar busca",
      noResults:
        "Nenhuma empresa americana compatível foi encontrada. Tente outro ticker.",
      matchHint: "Selecione uma empresa ou inicie o research diretamente.",
      queued: (symbol) => `A sala de research de ${symbol} está pronta.`,
    },
  },
  de: {
    a11y: {
      home: "Stocksembly Startseite",
      language: "Sprache",
      navigation: "Hauptnavigation",
      results: "Suchergebnisse",
    },
    nav: { product: "Produkt", getStarted: "Loslegen", pricing: "Tarife" },
    hero: {
      eyebrow: "KI-Researchteam für US-Aktien",
      titleLead: "Elf KI-Analysten",
      titleTail: "debattieren eine Aktie.",
      descriptionLead:
        "Sie recherchieren unabhängig, hinterfragen einander und liefern eine Research-Akte mit verlinkten Quellen.",
      descriptionTail: "Keine Kaufempfehlungen, keine Kursziele.",
      proof: "Debatte verfolgen, Quellen prüfen, selbst entscheiden.",
    },
    landing: {
      explainer: {
        eyebrow: "WAS SIE BEKOMMEN",
        title: "Eine Research-Akte, kein Tipp.",
        cards: [
          {
            title: "Quellen inklusive",
            body: "Jede Aussage verlinkt auf die Meldung, den Call oder die Daten dahinter – zum Selbstprüfen.",
          },
          {
            title: "Widerspruch bleibt sichtbar",
            body: "Sind sich die Analysten uneinig, behält die Akte beide Seiten und nennt, was die Frage klären würde.",
          },
          {
            title: "Einfacher Modus für Einsteiger",
            body: "Jederzeit auf verständliche Erklärungen umschalten. Tiefe und Belege bleiben gleich.",
          },
        ],
      },
      office: {
        headline:
          "Elf Analysten und der Vorsitz bei der Arbeit – und im Widerspruch – in Echtzeit",
        description:
          "Jeder Analyst recherchiert am eigenen Platz, dann treffen sich die Teams und hinterfragen einander. Ihr Research läuft in genau diesem Büro.",
        live: "Live-Research-Office",
        active: (count) => `${count} Agenten aktiv`,
        loading: "Research-Office wird vorbereitet",
        label: "Research-Office mit KI-Agenten",
        error: "Das Research-Office konnte nicht geladen werden.",
      },
      researchRoom: {
        questionLabel: "Gestellte Frage",
        eyebrow: "RESEARCH ROOM · NEUESTE FÜNF",
        title: "Entdecken Sie Fragen, die Anleger bereits gestellt haben.",
        description:
          "Karte umdrehen, Frage lesen und das fertige Research öffnen.",
        browse: "Alle Analysen ansehen",
        fullCommittee: "Gesamtes Komitee",
        teams: {
          market: "Marktteam",
          company: "Unternehmensteam",
          financial: "Finanzteam",
          risk: "Risikoteam",
        },
        flip: "Umdrehen ↗",
        flipLabel: (symbol, question) =>
          `Research-Karte für ${symbol} umdrehen: ${question}`,
        locked: "In 7 Tagen verfügbar · Zugang ansehen",
        open: "Research öffnen",
      },
      publishedTime: {
        justNow: "Gerade eben",
        minutesAgo: (minutes) => `Vor ${minutes} Min.`,
        hoursMinutesAgo: (hours, minutes) =>
          `Vor ${hours} Std.${minutes > 0 ? ` ${minutes} Min.` : ""}`,
      },
    },
    footer: {
      purpose:
        "KI-Aktienresearch, das Quellen erhält und Meinungsunterschiede sichtbar macht.",
      productHeading: "Produkt",
      howItWorks: "So funktioniert es",
      research: "Research starten",
      stockAnalysis: "US-Aktienanalyse",
      standardsHeading: "Über uns & Standards",
      about: "Über Stocksembly",
      methodology: "Research-Methodik",
      editorialPolicy: "Redaktionelle Richtlinie",
      corrections: "Korrekturrichtlinie",
      contactHeading: "Kontakt",
      support: "Kundensupport",
      operator: "Betrieben von SERN · Südkorea",
      legalHeading: "Rechtliches",
      terms: "Nutzungsbedingungen",
      privacy: "Datenschutzerklärung",
      disclaimerLabel: "Research-Hinweis",
      risk: "Risikohinweis",
      disclaimer:
        "KI-gestütztes Research zu Informations- und Bildungszwecken. Keine Kauf- oder Verkaufsempfehlung und kein Kursziel. Daten und Modellergebnisse können verzögert, unvollständig oder ungenau sein. Anlagen bergen das Risiko eines Kapitalverlusts.",
      rights: "SERN. Alle Rechte vorbehalten.",
    },
    search: {
      label: "Ticker oder Unternehmen",
      placeholder: "US-Ticker oder Unternehmen suchen",
      questionLabel: "Investmentfrage",
      questionPlaceholder:
        "Z. B.: Rechtfertigt das Wachstum die aktuelle Bewertung?",
      action: "Team-Research starten",
      loading: "Research-Raum wird vorbereitet",
      popular: "Beliebte Ticker",
      clear: "Suche löschen",
      noResults:
        "Kein unterstütztes US-Unternehmen gefunden. Versuchen Sie einen anderen Ticker.",
      matchHint: "Unternehmen auswählen oder Research direkt starten.",
      queued: (symbol) => `Der Research-Raum für ${symbol} ist bereit.`,
    },
  },
  fr: {
    a11y: {
      home: "Accueil Stocksembly",
      language: "Langue",
      navigation: "Navigation principale",
      results: "Résultats de recherche",
    },
    nav: { product: "Produit", getStarted: "Commencer", pricing: "Offres" },
    hero: {
      eyebrow: "Recherche IA sur les actions américaines",
      titleLead: "Onze analystes IA",
      titleTail: "débattent d'une action.",
      descriptionLead:
        "Ils enquêtent séparément, se contredisent et vous remettent un dossier de recherche où chaque source est liée.",
      descriptionTail: "Ni conseil d'achat, ni objectif de cours.",
      proof: "Suivez le débat, vérifiez les sources, décidez par vous-même.",
    },
    landing: {
      explainer: {
        eyebrow: "CE QUE VOUS OBTENEZ",
        title: "Un dossier de recherche, pas un tuyau.",
        cards: [
          {
            title: "Sources jointes",
            body: "Chaque affirmation renvoie au document, à la conférence ou aux données d'origine, pour vérifier vous-même.",
          },
          {
            title: "Le désaccord reste visible",
            body: "Quand les analystes divergent, le dossier conserve les deux positions et précise ce qui trancherait.",
          },
          {
            title: "Mode simple pour débutants",
            body: "Passez à des explications en langage clair à tout moment. La profondeur et les preuves restent identiques.",
          },
        ],
      },
      office: {
        headline:
          "Regardez onze analystes et le président travailler, et diverger, en temps réel",
        description:
          "Chaque analyste enquête à son bureau, puis les équipes se réunissent pour se contredire. Votre recherche se déroule dans ce même bureau.",
        live: "Bureau de recherche en direct",
        active: (count) => `${count} agents actifs`,
        loading: "Préparation du bureau de recherche",
        label: "Bureau de recherche avec agents IA",
        error: "Impossible de charger le bureau de recherche.",
      },
      researchRoom: {
        questionLabel: "Question posée",
        eyebrow: "RESEARCH ROOM · CINQ DERNIÈRES",
        title: "Découvrez les questions déjà posées par les investisseurs.",
        description:
          "Retournez la carte, lisez la question puis ouvrez la recherche complète.",
        browse: "Voir toutes les recherches",
        fullCommittee: "Comité complet",
        teams: {
          market: "Équipe marché",
          company: "Équipe entreprise",
          financial: "Équipe financière",
          risk: "Équipe risques",
        },
        flip: "Retourner ↗",
        flipLabel: (symbol, question) =>
          `Retourner la carte ${symbol} : ${question}`,
        locked: "Disponible dans 7 jours · Voir l’accès",
        open: "Ouvrir la recherche",
      },
      publishedTime: {
        justNow: "À l’instant",
        minutesAgo: (minutes) => `Il y a ${minutes} min`,
        hoursMinutesAgo: (hours, minutes) =>
          `Il y a ${hours} h${minutes > 0 ? ` ${minutes} min` : ""}`,
      },
    },
    footer: {
      purpose:
        "Une recherche actions par IA qui conserve les sources et rend les désaccords visibles.",
      productHeading: "Produit",
      howItWorks: "Fonctionnement",
      research: "Lancer une recherche",
      stockAnalysis: "Analyse d’actions américaines",
      standardsHeading: "À propos et standards",
      about: "À propos de Stocksembly",
      methodology: "Méthodologie",
      editorialPolicy: "Politique éditoriale",
      corrections: "Politique de correction",
      contactHeading: "Contact",
      support: "Service client",
      operator: "Opéré par SERN · Corée du Sud",
      legalHeading: "Mentions légales",
      terms: "Conditions d’utilisation",
      privacy: "Politique de confidentialité",
      disclaimerLabel: "Avertissement de recherche",
      risk: "Information sur les risques",
      disclaimer:
        "Recherche assistée par IA à des fins d’information et d’éducation. Il ne s’agit ni d’une recommandation d’achat ou de vente ni d’un objectif de cours. Les données et résultats peuvent être retardés, incomplets ou inexacts. Investir comporte un risque de perte en capital.",
      rights: "SERN. Tous droits réservés.",
    },
    search: {
      label: "Ticker ou entreprise",
      placeholder: "Rechercher un ticker ou une entreprise américaine",
      questionLabel: "Question d’investissement",
      questionPlaceholder:
        "Ex. : la croissance justifie-t-elle la valorisation actuelle ?",
      action: "Lancer la recherche en équipe",
      loading: "Préparation de la salle de recherche",
      popular: "Tickers populaires",
      clear: "Effacer la recherche",
      noResults:
        "Aucune entreprise américaine prise en charge n’a été trouvée. Essayez un autre ticker.",
      matchHint:
        "Sélectionnez une entreprise ou lancez directement la recherche.",
      queued: (symbol) => `La salle de recherche ${symbol} est prête.`,
    },
  },
};

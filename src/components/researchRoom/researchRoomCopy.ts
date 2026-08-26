import type { AppLocale } from "../../lib/i18n";

type ScopeKey =
  | "all"
  | "committee"
  | "market"
  | "company"
  | "financial"
  | "risk";

export type ResearchRoomUiCopy = {
  readonly eyebrow: string;
  readonly title: string;
  readonly newResearch: string;
  readonly companies: string;
  readonly companyFilter: string;
  readonly allCompanies: string;
  readonly reports: string;
  readonly researchFilters: string;
  readonly searchPlaceholder: string;
  readonly agentFilter: string;
  readonly scopes: Readonly<Record<ScopeKey, string>>;
  readonly teams: Readonly<Record<Exclude<ScopeKey, "all">, string>>;
  readonly allResearch: string;
  readonly sort: string;
  readonly latest: string;
  readonly popular: string;
  readonly thesisFallback: (symbol: string) => string;
  readonly opensAfterSevenDays: string;
  readonly open: string;
  readonly subscriberAccess: (symbol: string) => string;
  readonly noMatches: string;
  readonly pagination: string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly languageNoticeTitle: string;
  readonly languageNoticeBody: string;
  readonly cancel: string;
  readonly openOriginal: string;
  readonly back: string;
  readonly professionalTranslation: string;
  readonly translated: string;
  readonly signInToTranslate: string;
  readonly translationFailed: string;
  readonly lockedTitle: string;
  readonly lockedBody: string;
  readonly signIn: string;
  readonly creditTitle: string;
  readonly creditBody: string;
};

export const researchRoomUiCopy: Readonly<
  Record<AppLocale, ResearchRoomUiCopy>
> = {
  en: {
    eyebrow: "Editorial archive",
    title: "Research room",
    newResearch: "New research",
    companies: "Companies",
    companyFilter: "Company filter",
    allCompanies: "All companies",
    reports: "reports",
    researchFilters: "Research filters",
    searchPlaceholder: "Search ticker or investment question",
    agentFilter: "Agent filter",
    scopes: {
      all: "All",
      committee: "All agents",
      market: "Market agent",
      company: "Company agent",
      financial: "Financial agent",
      risk: "Risk agent",
    },
    teams: {
      committee: "Full committee",
      market: "Market team",
      company: "Company team",
      financial: "Financial team",
      risk: "Risk team",
    },
    allResearch: "All research",
    sort: "Sort",
    latest: "Latest",
    popular: "Popular",
    thesisFallback: (symbol) => `${symbol} investment thesis review`,
    opensAfterSevenDays: "Opens after 7 days",
    open: "Open",
    subscriberAccess: (symbol) => `${symbol} subscriber access`,
    noMatches: "No research matches these filters.",
    pagination: "Pagination",
    previousPage: "Previous page",
    nextPage: "Next page",
    languageNoticeTitle: "This research was created in another language",
    languageNoticeBody:
      "You can read the original now, then use professional translation inside the report for 1 credit.",
    cancel: "Cancel",
    openOriginal: "Open original",
    back: "Research room",
    professionalTranslation: "Professional translation · 1 credit",
    translated: "Translated",
    signInToTranslate: "Sign in to use professional translation.",
    translationFailed:
      "Translation could not be completed. Please try again shortly.",
    lockedTitle: "Latest research opens to paid members first.",
    lockedBody:
      "Free accounts can read the full report seven days after publication.",
    signIn: "Sign in",
    creditTitle: "This Research Room needs more credits.",
    creditBody: "Review your plan or wait for the next credit grant.",
  },
  ko: {
    eyebrow: "리서치 아카이브",
    title: "리서치룸",
    newResearch: "새 리서치",
    companies: "기업",
    companyFilter: "기업 필터",
    allCompanies: "전체 기업",
    reports: "개 리포트",
    researchFilters: "리서치 검색",
    searchPlaceholder: "티커 또는 투자 질문 검색",
    agentFilter: "에이전트 필터",
    scopes: {
      all: "전체",
      committee: "전체 에이전트",
      market: "시장 에이전트",
      company: "기업 에이전트",
      financial: "재무 에이전트",
      risk: "리스크 에이전트",
    },
    teams: {
      committee: "전체 위원회",
      market: "시장 분석팀",
      company: "기업 분석팀",
      financial: "재무 분석팀",
      risk: "리스크 분석팀",
    },
    allResearch: "전체 리서치",
    sort: "정렬",
    latest: "최신순",
    popular: "인기순",
    thesisFallback: (symbol) => `${symbol} 핵심 투자 논지 검증`,
    opensAfterSevenDays: "7일 후 공개",
    open: "열기",
    subscriberAccess: (symbol) => `${symbol} 최신 리서치 구독 안내`,
    noMatches: "조건에 맞는 리서치가 없습니다.",
    pagination: "페이지 이동",
    previousPage: "이전 페이지",
    nextPage: "다음 페이지",
    languageNoticeTitle: "다른 언어로 작성된 리서치입니다",
    languageNoticeBody:
      "원문을 먼저 열고 리포트 안에서 1크레딧으로 전문 번역할 수 있습니다.",
    cancel: "취소",
    openOriginal: "원문으로 열기",
    back: "리서치룸",
    professionalTranslation: "전문 번역 · 1 크레딧",
    translated: "번역 완료",
    signInToTranslate: "전문 번역은 로그인 후 이용할 수 있습니다.",
    translationFailed:
      "번역을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    lockedTitle: "최신 리서치는 유료 멤버에게 먼저 공개됩니다.",
    lockedBody:
      "무료 계정은 발행 7일 후 같은 리포트를 전체 열람할 수 있습니다.",
    signIn: "로그인",
    creditTitle: "크레딧이 부족해 리서치룸을 열 수 없습니다.",
    creditBody: "플랜을 확인하거나 다음 크레딧 지급을 기다려 주세요.",
  },
  ja: {
    eyebrow: "リサーチアーカイブ",
    title: "リサーチルーム",
    newResearch: "新しいリサーチ",
    companies: "企業",
    companyFilter: "企業フィルター",
    allCompanies: "すべての企業",
    reports: "件のレポート",
    researchFilters: "リサーチ検索",
    searchPlaceholder: "ティッカーまたは投資質問を検索",
    agentFilter: "エージェントフィルター",
    scopes: {
      all: "すべて",
      committee: "全エージェント",
      market: "市場",
      company: "企業",
      financial: "財務",
      risk: "リスク",
    },
    teams: {
      committee: "全体委員会",
      market: "市場分析チーム",
      company: "企業分析チーム",
      financial: "財務分析チーム",
      risk: "リスク分析チーム",
    },
    allResearch: "すべてのリサーチ",
    sort: "並び順",
    latest: "新着順",
    popular: "人気順",
    thesisFallback: (symbol) => `${symbol} 投資仮説レビュー`,
    opensAfterSevenDays: "7日後に公開",
    open: "開く",
    subscriberAccess: (symbol) => `${symbol} 会員向けリサーチ`,
    noMatches: "条件に一致するリサーチはありません。",
    pagination: "ページ移動",
    previousPage: "前のページ",
    nextPage: "次のページ",
    languageNoticeTitle: "別の言語で作成されたリサーチです",
    languageNoticeBody:
      "原文を開いた後、レポート内で1クレジットの専門翻訳を利用できます。",
    cancel: "キャンセル",
    openOriginal: "原文を開く",
    back: "リサーチルーム",
    professionalTranslation: "専門翻訳 · 1クレジット",
    translated: "翻訳済み",
    signInToTranslate: "専門翻訳を利用するにはログインしてください。",
    translationFailed:
      "翻訳を完了できませんでした。しばらくしてから再試行してください。",
    lockedTitle: "最新リサーチは有料会員に先行公開されます。",
    lockedBody: "無料アカウントは公開から7日後に全文を閲覧できます。",
    signIn: "ログイン",
    creditTitle: "このリサーチを開くにはクレジットが不足しています。",
    creditBody: "プランを確認するか、次回のクレジット付与をお待ちください。",
  },
  "zh-TW": {
    eyebrow: "研究檔案",
    title: "研究室",
    newResearch: "新增研究",
    companies: "公司",
    companyFilter: "公司篩選",
    allCompanies: "所有公司",
    reports: "份報告",
    researchFilters: "研究篩選",
    searchPlaceholder: "搜尋股票代號或投資問題",
    agentFilter: "代理篩選",
    scopes: {
      all: "全部",
      committee: "全部代理",
      market: "市場",
      company: "公司",
      financial: "財務",
      risk: "風險",
    },
    teams: {
      committee: "完整委員會",
      market: "市場團隊",
      company: "公司團隊",
      financial: "財務團隊",
      risk: "風險團隊",
    },
    allResearch: "所有研究",
    sort: "排序",
    latest: "最新",
    popular: "熱門",
    thesisFallback: (symbol) => `${symbol} 投資論點檢視`,
    opensAfterSevenDays: "7天後開放",
    open: "開啟",
    subscriberAccess: (symbol) => `${symbol} 訂閱者研究`,
    noMatches: "沒有符合條件的研究。",
    pagination: "分頁",
    previousPage: "上一頁",
    nextPage: "下一頁",
    languageNoticeTitle: "這份研究以其他語言撰寫",
    languageNoticeBody: "您可先閱讀原文，再於報告內使用1點數進行專業翻譯。",
    cancel: "取消",
    openOriginal: "開啟原文",
    back: "研究室",
    professionalTranslation: "專業翻譯 · 1點數",
    translated: "已翻譯",
    signInToTranslate: "請登入以使用專業翻譯。",
    translationFailed: "無法完成翻譯，請稍後再試。",
    lockedTitle: "最新研究優先提供付費會員。",
    lockedBody: "免費帳戶可在發布7天後閱讀完整報告。",
    signIn: "登入",
    creditTitle: "點數不足，無法開啟此研究。",
    creditBody: "請查看方案或等待下次點數發放。",
  },
  es: {
    eyebrow: "Archivo editorial",
    title: "Sala de investigación",
    newResearch: "Nueva investigación",
    companies: "Empresas",
    companyFilter: "Filtro de empresas",
    allCompanies: "Todas las empresas",
    reports: "informes",
    researchFilters: "Filtros de investigación",
    searchPlaceholder: "Buscar ticker o pregunta de inversión",
    agentFilter: "Filtro de agentes",
    scopes: {
      all: "Todos",
      committee: "Todos los agentes",
      market: "Mercado",
      company: "Empresa",
      financial: "Finanzas",
      risk: "Riesgo",
    },
    teams: {
      committee: "Comité completo",
      market: "Equipo de mercado",
      company: "Equipo de empresa",
      financial: "Equipo financiero",
      risk: "Equipo de riesgo",
    },
    allResearch: "Toda la investigación",
    sort: "Ordenar",
    latest: "Más recientes",
    popular: "Populares",
    thesisFallback: (symbol) => `Revisión de la tesis de ${symbol}`,
    opensAfterSevenDays: "Disponible en 7 días",
    open: "Abrir",
    subscriberAccess: (symbol) =>
      `Investigación de ${symbol} para suscriptores`,
    noMatches: "No hay investigaciones que coincidan.",
    pagination: "Paginación",
    previousPage: "Página anterior",
    nextPage: "Página siguiente",
    languageNoticeTitle: "Esta investigación fue creada en otro idioma",
    languageNoticeBody:
      "Puedes abrir el original y usar la traducción profesional dentro del informe por 1 crédito.",
    cancel: "Cancelar",
    openOriginal: "Abrir original",
    back: "Sala de investigación",
    professionalTranslation: "Traducción profesional · 1 crédito",
    translated: "Traducido",
    signInToTranslate: "Inicia sesión para usar la traducción profesional.",
    translationFailed:
      "No se pudo completar la traducción. Inténtalo de nuevo en breve.",
    lockedTitle:
      "Los miembros de pago reciben primero las investigaciones nuevas.",
    lockedBody:
      "Las cuentas gratuitas pueden leer el informe completo siete días después.",
    signIn: "Iniciar sesión",
    creditTitle:
      "No tienes créditos suficientes para abrir esta investigación.",
    creditBody: "Revisa tu plan o espera la próxima asignación de créditos.",
  },
  "pt-BR": {
    eyebrow: "Arquivo editorial",
    title: "Sala de pesquisa",
    newResearch: "Nova pesquisa",
    companies: "Empresas",
    companyFilter: "Filtro de empresas",
    allCompanies: "Todas as empresas",
    reports: "relatórios",
    researchFilters: "Filtros de pesquisa",
    searchPlaceholder: "Buscar ticker ou pergunta de investimento",
    agentFilter: "Filtro de agentes",
    scopes: {
      all: "Todos",
      committee: "Todos os agentes",
      market: "Mercado",
      company: "Empresa",
      financial: "Financeiro",
      risk: "Risco",
    },
    teams: {
      committee: "Comitê completo",
      market: "Equipe de mercado",
      company: "Equipe de empresa",
      financial: "Equipe financeira",
      risk: "Equipe de risco",
    },
    allResearch: "Todas as pesquisas",
    sort: "Ordenar",
    latest: "Mais recentes",
    popular: "Populares",
    thesisFallback: (symbol) => `Revisão da tese de ${symbol}`,
    opensAfterSevenDays: "Abre em 7 dias",
    open: "Abrir",
    subscriberAccess: (symbol) => `Pesquisa de ${symbol} para assinantes`,
    noMatches: "Nenhuma pesquisa corresponde aos filtros.",
    pagination: "Paginação",
    previousPage: "Página anterior",
    nextPage: "Próxima página",
    languageNoticeTitle: "Esta pesquisa foi criada em outro idioma",
    languageNoticeBody:
      "Abra o original e use a tradução profissional no relatório por 1 crédito.",
    cancel: "Cancelar",
    openOriginal: "Abrir original",
    back: "Sala de pesquisa",
    professionalTranslation: "Tradução profissional · 1 crédito",
    translated: "Traduzido",
    signInToTranslate: "Entre para usar a tradução profissional.",
    translationFailed:
      "Não foi possível concluir a tradução. Tente novamente em breve.",
    lockedTitle: "As pesquisas mais recentes chegam primeiro aos assinantes.",
    lockedBody:
      "Contas gratuitas podem ler o relatório completo após sete dias.",
    signIn: "Entrar",
    creditTitle: "Créditos insuficientes para abrir esta pesquisa.",
    creditBody: "Confira seu plano ou aguarde a próxima concessão de créditos.",
  },
  de: {
    eyebrow: "Redaktionelles Archiv",
    title: "Research Room",
    newResearch: "Neue Recherche",
    companies: "Unternehmen",
    companyFilter: "Unternehmensfilter",
    allCompanies: "Alle Unternehmen",
    reports: "Berichte",
    researchFilters: "Recherchefilter",
    searchPlaceholder: "Ticker oder Anlagefrage suchen",
    agentFilter: "Agentenfilter",
    scopes: {
      all: "Alle",
      committee: "Alle Agenten",
      market: "Markt",
      company: "Unternehmen",
      financial: "Finanzen",
      risk: "Risiko",
    },
    teams: {
      committee: "Gesamtes Komitee",
      market: "Marktteam",
      company: "Unternehmensteam",
      financial: "Finanzteam",
      risk: "Risikoteam",
    },
    allResearch: "Alle Recherchen",
    sort: "Sortieren",
    latest: "Neueste",
    popular: "Beliebt",
    thesisFallback: (symbol) => `Anlagethese zu ${symbol}`,
    opensAfterSevenDays: "Öffnet in 7 Tagen",
    open: "Öffnen",
    subscriberAccess: (symbol) => `${symbol}-Recherche für Abonnenten`,
    noMatches: "Keine passende Recherche gefunden.",
    pagination: "Seitennavigation",
    previousPage: "Vorherige Seite",
    nextPage: "Nächste Seite",
    languageNoticeTitle:
      "Diese Recherche wurde in einer anderen Sprache erstellt",
    languageNoticeBody:
      "Öffnen Sie das Original und nutzen Sie im Bericht die professionelle Übersetzung für 1 Credit.",
    cancel: "Abbrechen",
    openOriginal: "Original öffnen",
    back: "Research Room",
    professionalTranslation: "Professionelle Übersetzung · 1 Credit",
    translated: "Übersetzt",
    signInToTranslate: "Melden Sie sich für die professionelle Übersetzung an.",
    translationFailed:
      "Die Übersetzung konnte nicht abgeschlossen werden. Bitte versuchen Sie es später erneut.",
    lockedTitle:
      "Neue Recherchen sind zuerst für zahlende Mitglieder verfügbar.",
    lockedBody:
      "Kostenlose Konten können den vollständigen Bericht nach sieben Tagen lesen.",
    signIn: "Anmelden",
    creditTitle: "Nicht genügend Credits für diese Recherche.",
    creditBody:
      "Prüfen Sie Ihren Tarif oder warten Sie auf die nächste Credit-Zuteilung.",
  },
  fr: {
    eyebrow: "Archives éditoriales",
    title: "Salle de recherche",
    newResearch: "Nouvelle recherche",
    companies: "Entreprises",
    companyFilter: "Filtre des entreprises",
    allCompanies: "Toutes les entreprises",
    reports: "rapports",
    researchFilters: "Filtres de recherche",
    searchPlaceholder: "Rechercher un ticker ou une question",
    agentFilter: "Filtre des agents",
    scopes: {
      all: "Tous",
      committee: "Tous les agents",
      market: "Marché",
      company: "Entreprise",
      financial: "Finance",
      risk: "Risque",
    },
    teams: {
      committee: "Comité complet",
      market: "Équipe marché",
      company: "Équipe entreprise",
      financial: "Équipe finance",
      risk: "Équipe risque",
    },
    allResearch: "Toutes les recherches",
    sort: "Trier",
    latest: "Plus récentes",
    popular: "Populaires",
    thesisFallback: (symbol) => `Analyse de la thèse ${symbol}`,
    opensAfterSevenDays: "Disponible dans 7 jours",
    open: "Ouvrir",
    subscriberAccess: (symbol) => `Recherche ${symbol} pour abonnés`,
    noMatches: "Aucune recherche ne correspond aux filtres.",
    pagination: "Pagination",
    previousPage: "Page précédente",
    nextPage: "Page suivante",
    languageNoticeTitle: "Cette recherche a été créée dans une autre langue",
    languageNoticeBody:
      "Ouvrez l’original puis utilisez la traduction professionnelle dans le rapport pour 1 crédit.",
    cancel: "Annuler",
    openOriginal: "Ouvrir l’original",
    back: "Salle de recherche",
    professionalTranslation: "Traduction professionnelle · 1 crédit",
    translated: "Traduit",
    signInToTranslate:
      "Connectez-vous pour utiliser la traduction professionnelle.",
    translationFailed:
      "La traduction n’a pas pu être terminée. Réessayez dans un instant.",
    lockedTitle:
      "Les nouvelles recherches sont d’abord réservées aux membres payants.",
    lockedBody:
      "Les comptes gratuits peuvent lire le rapport complet après sept jours.",
    signIn: "Se connecter",
    creditTitle: "Crédits insuffisants pour ouvrir cette recherche.",
    creditBody:
      "Consultez votre forfait ou attendez la prochaine attribution de crédits.",
  },
};

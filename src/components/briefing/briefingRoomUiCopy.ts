import type { AppLocale } from "../../lib/i18n";

type BriefingRoomUiCopy = {
  readonly header: {
    readonly title: string;
    readonly eyebrow: string;
    readonly latest: string;
    readonly next: string;
    readonly eastern: string;
    readonly local: string;
    readonly countdown: string;
    readonly getStarted: string;
    readonly lockedTitle: string;
    readonly lockedBody: string;
    readonly plan: string;
  };
  readonly watchlist: {
    readonly title: string;
    readonly add: string;
    readonly search: string;
    readonly remaining: string;
    readonly times: string;
    readonly all: string;
    readonly remove: string;
  };
  readonly feed: {
    readonly latest: string;
    readonly history: string;
    readonly emptyTitle: string;
    readonly emptyBody: string;
    readonly noEditionTitle: string;
    readonly noEditionBody: string;
    readonly add: string;
  };
  readonly card: {
    readonly earnings: string;
    readonly confirmed: string;
    readonly estimated: string;
    readonly pending: string;
    readonly unread: string;
    readonly attention: Readonly<Record<"low" | "medium" | "high", string>>;
  };
};

export const briefingRoomUiCopy: Readonly<
  Record<AppLocale, BriefingRoomUiCopy>
> = {
  en: {
    header: {
      title: "Briefing room",
      eyebrow: "One hour before the US open",
      latest: "Latest edition",
      next: "Next edition",
      eastern: "America/New_York",
      local: "Your time",
      countdown: "Time remaining",
      getStarted: "Get started",
      lockedTitle: "See only what changed before the open",
      lockedBody:
        "Pro includes 3 watchlist names and Ultra includes 10, with a briefing every US trading day.",
      plan: "View plans",
    },
    watchlist: {
      title: "Watchlist",
      add: "Add stock",
      search: "Search ticker or company",
      remaining: "Changes remaining",
      times: "",
      all: "All",
      remove: "Remove from watchlist",
    },
    feed: {
      latest: "Latest briefings",
      history: "Briefing history",
      emptyTitle: "Add a stock for its first briefing",
      emptyBody:
        "Each edition isolates the changes and catalysts that matter before the open.",
      noEditionTitle: "Briefings begin at the next pre-market run",
      noEditionBody:
        "Your watchlist is ready. A new edition arrives one hour before the next US market open.",
      add: "Add stock",
    },
    card: {
      earnings: "Next earnings",
      confirmed: "Confirmed",
      estimated: "Estimated",
      pending: "Pending",
      unread: "Unread",
      attention: { low: "Low", medium: "Watch", high: "High" },
    },
  },
  ko: {
    header: {
      title: "브리핑룸",
      eyebrow: "미국 장 시작 1시간 전",
      latest: "최신 발행",
      next: "다음 발행",
      eastern: "미 동부시간",
      local: "한국시간",
      countdown: "남은 시간",
      getStarted: "시작하기",
      lockedTitle: "매일의 변화만 빠르게 확인하세요",
      lockedBody:
        "Pro는 3개, Ultra는 10개 관심종목에 대해 거래일마다 프리마켓 브리핑을 제공합니다.",
      plan: "플랜 확인하기",
    },
    watchlist: {
      title: "관심종목",
      add: "종목 추가",
      search: "티커 또는 기업 검색",
      remaining: "남은 변경 횟수",
      times: "회",
      all: "전체",
      remove: "관심종목에서 삭제",
    },
    feed: {
      latest: "최신 브리핑",
      history: "이전 브리핑",
      emptyTitle: "첫 브리핑을 준비할 종목을 추가하세요",
      emptyBody:
        "직전 발행 이후의 변화와 다음 촉매만 추려서 장 시작 전에 전달합니다.",
      noEditionTitle: "다음 프리마켓 브리핑부터 시작됩니다",
      noEditionBody:
        "관심종목 등록이 끝났습니다. 다음 미국 거래일 장 시작 한 시간 전에 새 브리핑이 도착합니다.",
      add: "종목 추가",
    },
    card: {
      earnings: "다음 실적",
      confirmed: "확정",
      estimated: "예상",
      pending: "미정",
      unread: "안 읽음",
      attention: { low: "낮음", medium: "주목", high: "높음" },
    },
  },
  ja: {
    header: {
      title: "ブリーフィング",
      eyebrow: "米国市場の開始1時間前",
      latest: "最新号",
      next: "次回発行",
      eastern: "米国東部時間",
      local: "現地時間",
      countdown: "残り時間",
      getStarted: "始める",
      lockedTitle: "寄り前に重要な変化だけを確認",
      lockedBody:
        "Proは3銘柄、Ultraは10銘柄について、米国取引日ごとにプレマーケット・ブリーフィングを提供します。",
      plan: "プランを見る",
    },
    watchlist: {
      title: "ウォッチリスト",
      add: "銘柄を追加",
      search: "ティッカーまたは企業を検索",
      remaining: "変更可能回数",
      times: "回",
      all: "すべて",
      remove: "ウォッチリストから削除",
    },
    feed: {
      latest: "最新ブリーフィング",
      history: "過去のブリーフィング",
      emptyTitle: "最初のブリーフィング用に銘柄を追加してください",
      emptyBody: "寄り前に重要な変化と次の材料だけを整理します。",
      noEditionTitle: "次回のプレマーケット発行から開始します",
      noEditionBody:
        "ウォッチリストの準備ができました。次の米国取引日の寄り1時間前に届きます。",
      add: "銘柄を追加",
    },
    card: {
      earnings: "次回決算",
      confirmed: "確定",
      estimated: "予想",
      pending: "未定",
      unread: "未読",
      attention: { low: "低", medium: "注目", high: "高" },
    },
  },
  "zh-TW": {
    header: {
      title: "簡報室",
      eyebrow: "美股開盤前一小時",
      latest: "最新一期",
      next: "下次發行",
      eastern: "美東時間",
      local: "當地時間",
      countdown: "剩餘時間",
      getStarted: "開始使用",
      lockedTitle: "開盤前只看重要變化",
      lockedBody:
        "Pro 可追蹤 3 檔，Ultra 可追蹤 10 檔，每個美股交易日提供盤前簡報。",
      plan: "查看方案",
    },
    watchlist: {
      title: "關注清單",
      add: "新增股票",
      search: "搜尋代號或公司",
      remaining: "剩餘變更次數",
      times: "次",
      all: "全部",
      remove: "從關注清單移除",
    },
    feed: {
      latest: "最新簡報",
      history: "歷史簡報",
      emptyTitle: "新增股票以取得第一份簡報",
      emptyBody: "每期只整理開盤前重要的變化與催化劑。",
      noEditionTitle: "將從下一次盤前發行開始",
      noEditionBody:
        "關注清單已就緒，下一個美股交易日開盤前一小時將收到新簡報。",
      add: "新增股票",
    },
    card: {
      earnings: "下次財報",
      confirmed: "已確認",
      estimated: "預估",
      pending: "未定",
      unread: "未讀",
      attention: { low: "低", medium: "關注", high: "高" },
    },
  },
  es: {
    header: {
      title: "Sala de informes",
      eyebrow: "Una hora antes de la apertura de EE. UU.",
      latest: "Última edición",
      next: "Próxima edición",
      eastern: "Hora del Este",
      local: "Tu hora",
      countdown: "Tiempo restante",
      getStarted: "Comenzar",
      lockedTitle: "Revisa solo lo que cambió antes de la apertura",
      lockedBody:
        "Pro incluye 3 valores y Ultra 10, con un informe cada día bursátil de EE. UU.",
      plan: "Ver planes",
    },
    watchlist: {
      title: "Seguimiento",
      add: "Añadir acción",
      search: "Buscar ticker o empresa",
      remaining: "Cambios restantes",
      times: "",
      all: "Todos",
      remove: "Quitar del seguimiento",
    },
    feed: {
      latest: "Últimos informes",
      history: "Historial",
      emptyTitle: "Añade una acción para su primer informe",
      emptyBody:
        "Cada edición resume los cambios y catalizadores clave antes de la apertura.",
      noEditionTitle: "Los informes comienzan en la próxima sesión previa",
      noEditionBody:
        "Tu lista está lista. Recibirás una edición una hora antes de la próxima apertura.",
      add: "Añadir acción",
    },
    card: {
      earnings: "Próximos resultados",
      confirmed: "Confirmado",
      estimated: "Estimado",
      pending: "Pendiente",
      unread: "Sin leer",
      attention: { low: "Bajo", medium: "Atención", high: "Alto" },
    },
  },
  "pt-BR": {
    header: {
      title: "Sala de briefing",
      eyebrow: "Uma hora antes da abertura dos EUA",
      latest: "Última edição",
      next: "Próxima edição",
      eastern: "Horário de Nova York",
      local: "Seu horário",
      countdown: "Tempo restante",
      getStarted: "Começar",
      lockedTitle: "Veja apenas o que mudou antes da abertura",
      lockedBody:
        "O Pro inclui 3 ações e o Ultra 10, com briefing em cada pregão dos EUA.",
      plan: "Ver planos",
    },
    watchlist: {
      title: "Lista de interesse",
      add: "Adicionar ação",
      search: "Buscar ticker ou empresa",
      remaining: "Alterações restantes",
      times: "",
      all: "Todas",
      remove: "Remover da lista",
    },
    feed: {
      latest: "Briefings mais recentes",
      history: "Histórico",
      emptyTitle: "Adicione uma ação para o primeiro briefing",
      emptyBody:
        "Cada edição destaca mudanças e catalisadores relevantes antes da abertura.",
      noEditionTitle: "Os briefings começam na próxima rodada pré-mercado",
      noEditionBody:
        "Sua lista está pronta. Uma nova edição chega uma hora antes da próxima abertura.",
      add: "Adicionar ação",
    },
    card: {
      earnings: "Próximo resultado",
      confirmed: "Confirmado",
      estimated: "Estimado",
      pending: "Pendente",
      unread: "Não lido",
      attention: { low: "Baixo", medium: "Atenção", high: "Alto" },
    },
  },
  de: {
    header: {
      title: "Briefing-Raum",
      eyebrow: "Eine Stunde vor US-Handelsstart",
      latest: "Neueste Ausgabe",
      next: "Nächste Ausgabe",
      eastern: "US-Ostküstenzeit",
      local: "Ihre Zeit",
      countdown: "Verbleibende Zeit",
      getStarted: "Loslegen",
      lockedTitle: "Vor Handelsstart nur relevante Änderungen sehen",
      lockedBody:
        "Pro umfasst 3 und Ultra 10 Beobachtungswerte mit einem Briefing an jedem US-Handelstag.",
      plan: "Tarife ansehen",
    },
    watchlist: {
      title: "Watchlist",
      add: "Aktie hinzufügen",
      search: "Ticker oder Unternehmen suchen",
      remaining: "Verbleibende Änderungen",
      times: "",
      all: "Alle",
      remove: "Von der Watchlist entfernen",
    },
    feed: {
      latest: "Neueste Briefings",
      history: "Briefing-Verlauf",
      emptyTitle: "Aktie für das erste Briefing hinzufügen",
      emptyBody:
        "Jede Ausgabe filtert relevante Änderungen und Katalysatoren vor Handelsstart.",
      noEditionTitle: "Briefings starten mit dem nächsten Pre-Market-Lauf",
      noEditionBody:
        "Ihre Watchlist ist bereit. Die nächste Ausgabe erscheint eine Stunde vor Handelsstart.",
      add: "Aktie hinzufügen",
    },
    card: {
      earnings: "Nächste Zahlen",
      confirmed: "Bestätigt",
      estimated: "Geschätzt",
      pending: "Offen",
      unread: "Ungelesen",
      attention: { low: "Niedrig", medium: "Beobachten", high: "Hoch" },
    },
  },
  fr: {
    header: {
      title: "Salle de briefing",
      eyebrow: "Une heure avant l’ouverture américaine",
      latest: "Dernière édition",
      next: "Prochaine édition",
      eastern: "Heure de New York",
      local: "Votre heure",
      countdown: "Temps restant",
      getStarted: "Commencer",
      lockedTitle: "Ne voyez que les changements importants avant l’ouverture",
      lockedBody:
        "Pro couvre 3 valeurs et Ultra 10, avec un briefing chaque jour de bourse américain.",
      plan: "Voir les offres",
    },
    watchlist: {
      title: "Liste de suivi",
      add: "Ajouter une action",
      search: "Rechercher un ticker ou une entreprise",
      remaining: "Modifications restantes",
      times: "",
      all: "Toutes",
      remove: "Retirer de la liste",
    },
    feed: {
      latest: "Derniers briefings",
      history: "Historique",
      emptyTitle: "Ajoutez une action pour son premier briefing",
      emptyBody:
        "Chaque édition isole les changements et catalyseurs importants avant l’ouverture.",
      noEditionTitle:
        "Les briefings commenceront au prochain passage pré-marché",
      noEditionBody:
        "Votre liste est prête. Une nouvelle édition arrivera une heure avant la prochaine ouverture.",
      add: "Ajouter une action",
    },
    card: {
      earnings: "Prochains résultats",
      confirmed: "Confirmé",
      estimated: "Estimé",
      pending: "À confirmer",
      unread: "Non lu",
      attention: { low: "Faible", medium: "À suivre", high: "Élevé" },
    },
  },
};

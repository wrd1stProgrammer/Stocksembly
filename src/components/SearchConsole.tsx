import {
  ChevronDown,
  LockKeyhole,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { authIsConfigured } from "../auth/amplifyClient";
import { createAuthenticatedResearchClient } from "../auth/researchClient";
import { currentAuthTokens } from "../auth/researchSession";
import type { AppLocale } from "../lib/i18n";
import { copy, researchLocale } from "../lib/i18n";
import { filterTickers, searchUsTickers, type Ticker } from "../lib/tickers";
import { notifyBillingChanged } from "../lib/whop/billingEvents";
import { researchCreditCost } from "../lib/whop/creditPolicy";
import { ResearchRequestError } from "../research/client/api";
import { TickerSymbolSchema } from "../research/domain/ids";
import { RESEARCH_DIRECTION_MAX_CHARACTERS } from "../research/domain/researchDirection";
import {
  DEFAULT_RESEARCH_PROFILE,
  type ResearchProfile,
} from "../research/domain/researchProfile";
import {
  COMMITTEE_RESEARCH_TARGET,
  RESEARCH_DEPARTMENT_COPY,
  type ResearchTarget,
  recommendResearchTarget,
} from "../research/domain/researchTarget";
import { CreditShortageModal } from "./billing/CreditShortageModal";
import { MembershipAccessModal } from "./billing/MembershipAccessModal";
import { ResearchExplanationModeControl } from "./ResearchExplanationModeControl";
import {
  BorderBeam,
  ResearchButton,
  ResearchQuestionField,
  SearchField,
} from "./SearchPrimitives";

type SearchConsoleProps = {
  readonly locale: AppLocale;
  readonly onOpenPlans?: () => void;
  readonly subscriptionTier?: "unknown" | "free" | "paid";
  readonly creditsRemaining?: number | undefined;
  readonly tickerSearch?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly Ticker[]>;
};

type DetailCopy = {
  readonly committee: string;
  readonly committeeNote: string;
  readonly teamNotes: Readonly<
    Record<"market" | "company" | "financial" | "risk", string>
  >;
  readonly selectedLabel: string;
  readonly clearSelection: string;
  readonly mode: string;
  readonly auto: string;
  readonly close: string;
  readonly addComparison: string;
  readonly startError: string;
  readonly customize: string;
  readonly horizon: string;
  readonly horizonNote: string;
  readonly counter: string;
  readonly counterNote: string;
  readonly depth: string;
  readonly depthNote: string;
  readonly purpose: string;
  readonly purposeNote: string;
  readonly peers: string;
  readonly peersNote: string;
  readonly peerPlaceholder: string;
  readonly noPeers: string;
  readonly horizonOptions: Readonly<
    Record<"short" | "medium" | "long", string>
  >;
  readonly counterOptions: Readonly<Record<"standard" | "strong", string>>;
  readonly depthOptions: Readonly<Record<"core" | "standard" | "deep", string>>;
  readonly purposeOptions: Readonly<
    Record<
      "new_entry" | "holding_review" | "position_sizing" | "earnings",
      string
    >
  >;
};

const SEARCH_DETAIL_COPY: Readonly<Record<AppLocale, DetailCopy>> = {
  en: {
    committee: "Full research committee",
    committeeNote: "All 11 specialists, rebuttal, and final decision",
    teamNotes: {
      market: "Market regime, news, price context, rate sensitivity",
      company: "Business model, products, customers, competitive edge",
      financial: "Earnings, cash flow, financial quality, valuation",
      risk: "Downside scenarios, regulation, warning signals",
    },
    selectedLabel: "Selected · one stock at a time",
    clearSelection: "Clear selected stock",
    mode: "Research mode",
    auto: "Use question-based recommendation",
    close: "Close",
    addComparison: "Add comparison",
    startError: "Unable to start research. Please try again.",
    customize: "Customize",
    horizon: "Investment horizon",
    horizonNote: "How long the decision should remain valid",
    counter: "Counterargument",
    counterNote: "How aggressively the opposing case is tested",
    depth: "Analysis depth",
    depthNote: "Evidence breadth and report length",
    purpose: "Decision purpose",
    purposeNote: "The action the report should help decide",
    peers: "Comparisons (optional)",
    peersNote: "Compared against the main stock · up to 5",
    peerPlaceholder: "Add ticker (e.g. AMD)",
    noPeers: "None",
    horizonOptions: { short: "Short", medium: "Medium", long: "Long" },
    counterOptions: { standard: "Standard", strong: "Strong" },
    depthOptions: { core: "Core", standard: "Standard", deep: "Deep" },
    purposeOptions: {
      new_entry: "New entry",
      holding_review: "Holding review",
      position_sizing: "Position sizing",
      earnings: "Around earnings",
    },
  },
  ko: {
    committee: "전체 에이전트 위원회",
    committeeNote: "11명 전체 분석과 반론·최종 판단",
    teamNotes: {
      market: "시장 국면·뉴스·가격 흐름·금리 민감도",
      company: "사업 모델·제품·고객·경쟁 우위",
      financial: "실적·현금흐름·재무 품질·밸류에이션",
      risk: "하방 시나리오·규제·경고 신호",
    },
    selectedLabel: "선택된 종목 · 한 번에 하나",
    clearSelection: "선택 종목 지우기",
    mode: "리서치 방식",
    auto: "질문에 맞춰 다시 추천",
    close: "닫기",
    addComparison: "비교기업 추가",
    startError: "리서치를 시작할 수 없습니다. 다시 시도해 주세요.",
    customize: "맞춤 설정",
    horizon: "투자 기간",
    horizonNote: "판단이 유효해야 할 시간",
    counter: "반론 강도",
    counterNote: "반대 논리를 파고드는 정도",
    depth: "분석 깊이",
    depthNote: "에이전트별 논거와 리포트 분량",
    purpose: "의사결정 목적",
    purposeNote: "결론을 실제 행동 조건으로 바꾸는 기준",
    peers: "비교 대상 (선택 사항)",
    peersNote: "주 종목과 상대 비교 · 최대 5개",
    peerPlaceholder: "티커 입력 (예: AMD)",
    noPeers: "미포함",
    horizonOptions: { short: "단기", medium: "중기", long: "장기" },
    counterOptions: { standard: "표준", strong: "강하게" },
    depthOptions: { core: "핵심", standard: "표준", deep: "심층" },
    purposeOptions: {
      new_entry: "신규 진입",
      holding_review: "보유 점검",
      position_sizing: "비중 조절",
      earnings: "실적 전후",
    },
  },
  ja: {
    committee: "全エージェント委員会",
    committeeNote: "11人の分析、反対論、最終判断",
    teamNotes: {
      market: "市場局面・ニュース・価格動向・金利感応度",
      company: "ビジネスモデル・製品・顧客・競争優位",
      financial: "業績・キャッシュフロー・財務品質・バリュエーション",
      risk: "下振れシナリオ・規制・警告シグナル",
    },
    selectedLabel: "選択中の銘柄 · 一度に1銘柄",
    clearSelection: "選択を解除",
    mode: "リサーチ方式",
    auto: "質問に合わせて再推薦",
    close: "閉じる",
    addComparison: "比較企業を追加",
    startError: "リサーチを開始できません。もう一度お試しください。",
    customize: "カスタム設定",
    horizon: "投資期間",
    horizonNote: "判断を有効とする期間",
    counter: "反対論の強度",
    counterNote: "反対の見方を検証する深さ",
    depth: "分析の深さ",
    depthNote: "根拠の範囲とレポート量",
    purpose: "判断目的",
    purposeNote: "レポートで決めたい行動",
    peers: "比較対象（任意）",
    peersNote: "メイン銘柄との相対比較 · 最大5社",
    peerPlaceholder: "ティッカーを追加（例：AMD）",
    noPeers: "なし",
    horizonOptions: { short: "短期", medium: "中期", long: "長期" },
    counterOptions: { standard: "標準", strong: "強め" },
    depthOptions: { core: "要点", standard: "標準", deep: "詳細" },
    purposeOptions: {
      new_entry: "新規投資",
      holding_review: "保有点検",
      position_sizing: "比率調整",
      earnings: "決算前後",
    },
  },
  "zh-TW": {
    committee: "全體代理委員會",
    committeeNote: "11 位專家分析、反方論點與最終判斷",
    teamNotes: {
      market: "市場局勢、新聞、價格走勢、利率敏感度",
      company: "商業模式、產品、客戶、競爭優勢",
      financial: "獲利、現金流、財務品質、估值",
      risk: "下行情境、法規、警訊",
    },
    selectedLabel: "已選股票 · 一次一檔",
    clearSelection: "清除已選股票",
    mode: "研究模式",
    auto: "依問題重新推薦",
    close: "關閉",
    addComparison: "新增比較公司",
    startError: "無法開始研究，請再試一次。",
    customize: "自訂設定",
    horizon: "投資期間",
    horizonNote: "此判斷預計維持有效的時間",
    counter: "反方強度",
    counterNote: "檢驗反方論點的深入程度",
    depth: "分析深度",
    depthNote: "證據範圍與報告篇幅",
    purpose: "決策目的",
    purposeNote: "本報告要協助做出的行動",
    peers: "比較對象（選填）",
    peersNote: "與主要股票相對比較 · 最多 5 家",
    peerPlaceholder: "輸入代號（例如 AMD）",
    noPeers: "不納入",
    horizonOptions: { short: "短期", medium: "中期", long: "長期" },
    counterOptions: { standard: "標準", strong: "加強" },
    depthOptions: { core: "重點", standard: "標準", deep: "深入" },
    purposeOptions: {
      new_entry: "新建部位",
      holding_review: "持股檢視",
      position_sizing: "部位調整",
      earnings: "財報前後",
    },
  },
  es: {
    committee: "Comité completo de agentes",
    committeeNote:
      "Los 11 especialistas, la tesis contraria y la decisión final",
    teamNotes: {
      market: "Contexto de mercado, noticias, precio y sensibilidad a tipos",
      company: "Modelo de negocio, productos, clientes y ventaja competitiva",
      financial: "Resultados, flujo de caja, calidad financiera y valoración",
      risk: "Escenarios adversos, regulación y señales de alerta",
    },
    selectedLabel: "Seleccionada · una acción a la vez",
    clearSelection: "Quitar la acción seleccionada",
    mode: "Modo de análisis",
    auto: "Volver a recomendar según la pregunta",
    close: "Cerrar",
    addComparison: "Agregar comparable",
    startError: "No se pudo iniciar el análisis. Inténtalo de nuevo.",
    customize: "Personalizar",
    horizon: "Horizonte de inversión",
    horizonNote: "Durante cuánto tiempo debe ser válida la decisión",
    counter: "Intensidad de la tesis contraria",
    counterNote: "Cuánto se profundiza en los argumentos opuestos",
    depth: "Profundidad",
    depthNote: "Alcance de la evidencia y extensión del informe",
    purpose: "Objetivo de la decisión",
    purposeNote: "La acción que el informe debe ayudar a decidir",
    peers: "Comparables (opcional)",
    peersNote: "Comparadas con la acción principal · hasta 5",
    peerPlaceholder: "Agregar ticker (p. ej., AMD)",
    noPeers: "Sin comparables",
    horizonOptions: {
      short: "Corto plazo",
      medium: "Mediano plazo",
      long: "Largo plazo",
    },
    counterOptions: { standard: "Estándar", strong: "Fuerte" },
    depthOptions: { core: "Esencial", standard: "Estándar", deep: "Profundo" },
    purposeOptions: {
      new_entry: "Nueva entrada",
      holding_review: "Revisar posición",
      position_sizing: "Ajustar peso",
      earnings: "En torno a resultados",
    },
  },
  "pt-BR": {
    committee: "Comitê completo de agentes",
    committeeNote: "Os 11 especialistas, contrapontos e decisão final",
    teamNotes: {
      market: "Contexto de mercado, notícias, preço e sensibilidade a juros",
      company: "Modelo de negócio, produtos, clientes e vantagem competitiva",
      financial: "Resultados, fluxo de caixa, qualidade financeira e valuation",
      risk: "Cenários adversos, regulação e sinais de alerta",
    },
    selectedLabel: "Selecionada · uma ação por vez",
    clearSelection: "Limpar ação selecionada",
    mode: "Modo de research",
    auto: "Recomendar novamente pela pergunta",
    close: "Fechar",
    addComparison: "Adicionar comparável",
    startError: "Não foi possível iniciar o research. Tente novamente.",
    customize: "Personalizar",
    horizon: "Horizonte de investimento",
    horizonNote: "Por quanto tempo a decisão deve permanecer válida",
    counter: "Força do contraponto",
    counterNote: "Até onde a tese contrária será testada",
    depth: "Profundidade",
    depthNote: "Amplitude das evidências e tamanho do relatório",
    purpose: "Objetivo da decisão",
    purposeNote: "A ação que o relatório deve ajudar a decidir",
    peers: "Comparáveis (opcional)",
    peersNote: "Comparadas com a ação principal · até 5",
    peerPlaceholder: "Adicionar ticker (ex.: AMD)",
    noPeers: "Nenhum",
    horizonOptions: {
      short: "Curto prazo",
      medium: "Médio prazo",
      long: "Longo prazo",
    },
    counterOptions: { standard: "Padrão", strong: "Forte" },
    depthOptions: { core: "Essencial", standard: "Padrão", deep: "Profundo" },
    purposeOptions: {
      new_entry: "Nova entrada",
      holding_review: "Revisar posição",
      position_sizing: "Ajustar peso",
      earnings: "Em torno dos resultados",
    },
  },
  de: {
    committee: "Gesamtes Agentenkomitee",
    committeeNote: "Alle 11 Fachrollen, Gegenposition und Schlussurteil",
    teamNotes: {
      market: "Marktlage, Nachrichten, Kursumfeld, Zinssensitivität",
      company: "Geschäftsmodell, Produkte, Kunden, Wettbewerbsvorteil",
      financial: "Ergebnis, Cashflow, Finanzqualität, Bewertung",
      risk: "Abwärtsszenarien, Regulierung, Warnsignale",
    },
    selectedLabel: "Ausgewählt · eine Aktie auf einmal",
    clearSelection: "Auswahl aufheben",
    mode: "Research-Modus",
    auto: "Anhand der Frage neu empfehlen",
    close: "Schließen",
    addComparison: "Vergleich hinzufügen",
    startError:
      "Research konnte nicht gestartet werden. Bitte versuchen Sie es erneut.",
    customize: "Anpassen",
    horizon: "Anlagehorizont",
    horizonNote: "Wie lange die Entscheidung gelten soll",
    counter: "Stärke der Gegenposition",
    counterNote: "Wie gründlich die Gegenthese geprüft wird",
    depth: "Analysetiefe",
    depthNote: "Umfang der Belege und Berichtslänge",
    purpose: "Entscheidungsziel",
    purposeNote: "Welche Handlung der Bericht unterstützen soll",
    peers: "Vergleichswerte (optional)",
    peersNote: "Vergleich mit der Hauptaktie · bis zu 5",
    peerPlaceholder: "Ticker hinzufügen (z. B. AMD)",
    noPeers: "Keine",
    horizonOptions: {
      short: "Kurzfristig",
      medium: "Mittelfristig",
      long: "Langfristig",
    },
    counterOptions: { standard: "Standard", strong: "Stark" },
    depthOptions: {
      core: "Kernpunkte",
      standard: "Standard",
      deep: "Vertieft",
    },
    purposeOptions: {
      new_entry: "Neueinstieg",
      holding_review: "Bestand prüfen",
      position_sizing: "Gewichtung anpassen",
      earnings: "Rund um Zahlen",
    },
  },
  fr: {
    committee: "Comité complet d’agents",
    committeeNote:
      "Les 11 spécialistes, la thèse opposée et la décision finale",
    teamNotes: {
      market: "Contexte de marché, actualités, prix, sensibilité aux taux",
      company: "Modèle économique, produits, clients, avantage concurrentiel",
      financial: "Résultats, trésorerie, qualité financière, valorisation",
      risk: "Scénarios baissiers, réglementation, signaux d'alerte",
    },
    selectedLabel: "Sélectionnée · une action à la fois",
    clearSelection: "Retirer l'action sélectionnée",
    mode: "Mode de recherche",
    auto: "Recommander selon la question",
    close: "Fermer",
    addComparison: "Ajouter un comparable",
    startError: "Impossible de lancer la recherche. Veuillez réessayer.",
    customize: "Personnaliser",
    horizon: "Horizon d’investissement",
    horizonNote: "Durée de validité attendue de la décision",
    counter: "Intensité de la thèse opposée",
    counterNote: "Niveau d’examen des arguments contraires",
    depth: "Profondeur",
    depthNote: "Étendue des preuves et longueur du rapport",
    purpose: "Objectif de décision",
    purposeNote: "L’action que le rapport doit aider à décider",
    peers: "Comparables (facultatif)",
    peersNote: "Comparées à l'action principale · jusqu'à 5",
    peerPlaceholder: "Ajouter un ticker (ex. AMD)",
    noPeers: "Aucun",
    horizonOptions: {
      short: "Court terme",
      medium: "Moyen terme",
      long: "Long terme",
    },
    counterOptions: { standard: "Standard", strong: "Renforcé" },
    depthOptions: {
      core: "Essentiel",
      standard: "Standard",
      deep: "Approfondi",
    },
    purposeOptions: {
      new_entry: "Nouvelle entrée",
      holding_review: "Revoir la position",
      position_sizing: "Ajuster le poids",
      earnings: "Autour des résultats",
    },
  },
};

export function SearchConsole({
  locale,
  onOpenPlans,
  subscriptionTier = "unknown",
  creditsRemaining,
  tickerSearch = searchUsTickers,
}: SearchConsoleProps) {
  const labels = copy[locale].search;
  const [query, setQuery] = useState("");
  const [researchQuestion, setResearchQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, startTransition] = useTransition();
  const [resultsOpen, setResultsOpen] = useState(false);
  const [remoteMatches, setRemoteMatches] = useState<readonly Ticker[]>([]);
  const [remoteQuery, setRemoteQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<Ticker>();
  const [isSearching, setIsSearching] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const [creditShortageOpen, setCreditShortageOpen] = useState(false);
  const [membershipGateOpen, setMembershipGateOpen] = useState(false);
  const [targetOverride, setTargetOverride] = useState<ResearchTarget>();
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [researchProfile, setResearchProfile] = useState<ResearchProfile>(
    DEFAULT_RESEARCH_PROFILE,
  );
  const [comparisonDraft, setComparisonDraft] = useState("");
  const router = useRouter();
  const client = useMemo(() => createAuthenticatedResearchClient(), []);
  const normalizedQuery = query.trim().toLowerCase();
  const localMatches = useMemo(() => filterTickers(query), [query]);
  const matches =
    remoteQuery === normalizedQuery && remoteMatches.length > 0
      ? remoteMatches
      : localMatches;
  const firstMatch = selectedTicker ?? matches[0];
  const hasQuery = query.trim().length > 0;
  const hasResults = firstMatch !== undefined;
  const hasResearchQuestion = researchQuestion.trim().length > 0;
  const canStartResearch = hasResults && hasResearchQuestion && !isSubmitting;
  const invalid = hasQuery && !hasResults && !isSearching;
  const recommendation = useMemo(
    () => recommendResearchTarget(researchQuestion),
    [researchQuestion],
  );
  const researchTarget = targetOverride ?? recommendation.target;
  const requiredCredits = researchCreditCost(researchTarget);
  const customSettingsLocked = subscriptionTier === "free";
  const detailCopy = SEARCH_DETAIL_COPY[locale];
  const targetCopy =
    researchTarget.kind === "committee"
      ? detailCopy.committee
      : RESEARCH_DEPARTMENT_COPY[researchTarget.departmentId][
          researchLocale(locale)
        ];
  const profileCopy = detailCopy;

  function updateProfile<Key extends keyof ResearchProfile>(
    key: Key,
    value: ResearchProfile[Key],
  ) {
    setResearchProfile((current) => ({ ...current, [key]: value }));
  }

  function addComparisonSymbol() {
    const parsedSymbol = TickerSymbolSchema.safeParse(
      comparisonDraft.trim().toUpperCase(),
    );
    if (!parsedSymbol.success) return;
    const symbol = parsedSymbol.data;
    if (
      symbol === firstMatch?.symbol ||
      researchProfile.comparisonSymbols.includes(symbol) ||
      researchProfile.comparisonSymbols.length >= 5
    ) {
      setComparisonDraft("");
      return;
    }
    updateProfile("comparisonSymbols", [
      ...researchProfile.comparisonSymbols,
      symbol,
    ]);
    setComparisonDraft("");
  }
  useEffect(() => {
    if (
      normalizedQuery.length === 0 ||
      localMatches.some(
        (ticker) => ticker.symbol.toLowerCase() === normalizedQuery,
      )
    ) {
      setRemoteMatches([]);
      setRemoteQuery("");
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void tickerSearch(normalizedQuery, controller.signal)
        .then((results) => {
          setRemoteMatches(results);
          setRemoteQuery(normalizedQuery);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setRemoteMatches([]);
            setRemoteQuery(normalizedQuery);
          }
        })
        .finally(() => setIsSearching(false));
    }, 120);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [localMatches, normalizedQuery, tickerSearch]);

  function selectTicker(ticker: Ticker) {
    setSelectedTicker(ticker);
    setQuery(ticker.symbol);
    setResultsOpen(false);
  }

  function clearSearch() {
    setQuery("");
    setSelectedTicker(undefined);
    setResultsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") clearSearch();
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstMatch || !hasResearchQuestion) return;

    setSubmissionError(undefined);
    setResultsOpen(false);
    setIsSubmitting(true);
    if (authIsConfigured()) {
      const tokens = await currentAuthTokens().catch(() => ({
        accessToken: undefined,
      }));
      if (tokens.accessToken === undefined) {
        setIsSubmitting(false);
        router.push(
          `/login?next=${encodeURIComponent(`/?lang=${locale}#research`)}`,
        );
        return;
      }
    }
    if (creditsRemaining !== undefined && creditsRemaining < requiredCredits) {
      setIsSubmitting(false);
      setCreditShortageOpen(true);
      return;
    }
    const idempotencyKey = crypto.randomUUID();
    try {
      const created = await client.startRun({
        symbol: firstMatch.symbol,
        question: researchQuestion,
        locale: researchLocale(locale),
        idempotencyKey,
        researchTarget,
        researchProfile,
      });
      notifyBillingChanged();
      startTransition(() => {
        router.push(
          `/research/${firstMatch.symbol}?run=${created.run.runId}&lang=${locale}`,
        );
      });
    } catch (error) {
      if (error instanceof ResearchRequestError && error.status === 401) {
        router.push(
          `/login?next=${encodeURIComponent(`/?lang=${locale}#research`)}`,
        );
        return;
      }
      if (
        error instanceof ResearchRequestError &&
        error.code === "CREDITS_INSUFFICIENT"
      ) {
        setCreditShortageOpen(true);
        return;
      }
      setSubmissionError(detailCopy.startError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <BorderBeam
        active={isSubmitting}
        size="pulse-outside"
        colorVariant="colorful"
      >
        <form className="search-console" id="research" onSubmit={submitSearch}>
          <div className="search-console__primary">
            <SearchField
              value={query}
              label={labels.label}
              placeholder={labels.placeholder}
              invalid={invalid}
              onChange={(value) => {
                setQuery(value);
                setSelectedTicker(undefined);
                setResultsOpen(true);
              }}
              onKeyDown={handleKeyDown}
            />
            <ResearchQuestionField
              value={researchQuestion}
              label={labels.questionLabel}
              placeholder={labels.questionPlaceholder}
              onChange={(value) =>
                setResearchQuestion(
                  Array.from(value)
                    .slice(0, RESEARCH_DIRECTION_MAX_CHARACTERS)
                    .join(""),
                )
              }
            />
          </div>

          {selectedTicker === undefined ? null : (
            <p className="search-console__selection" role="status">
              <span>{detailCopy.selectedLabel}</span>
              <strong>{selectedTicker.symbol}</strong>
              <span>{selectedTicker.company}</span>
              <button
                type="button"
                aria-label={detailCopy.clearSelection}
                onClick={clearSearch}
              >
                <X aria-hidden="true" size={12} />
              </button>
            </p>
          )}

          {profileOpen ? (
            <section
              className="research-profile"
              id="research-profile-panel"
              aria-label={profileCopy.customize}
            >
              <header>
                <div>
                  <strong>{profileCopy.customize}</strong>
                  <small>
                    {
                      profileCopy.horizonOptions[
                        researchProfile.investmentHorizon
                      ]
                    }
                    {" · "}
                    {profileCopy.depthOptions[researchProfile.analysisDepth]}
                    {" · "}
                    {
                      profileCopy.purposeOptions[
                        researchProfile.decisionPurpose
                      ]
                    }
                  </small>
                </div>
                <button
                  type="button"
                  aria-label={detailCopy.close}
                  onClick={() => setProfileOpen(false)}
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </header>
              <div className="research-profile__grid">
                <ProfileChoice
                  label={profileCopy.horizon}
                  note={profileCopy.horizonNote}
                  value={researchProfile.investmentHorizon}
                  options={profileCopy.horizonOptions}
                  onChange={(value) =>
                    updateProfile("investmentHorizon", value)
                  }
                />
                <ProfileChoice
                  label={profileCopy.counter}
                  note={profileCopy.counterNote}
                  value={researchProfile.counterargumentIntensity}
                  options={profileCopy.counterOptions}
                  onChange={(value) =>
                    updateProfile("counterargumentIntensity", value)
                  }
                />
                <ProfileChoice
                  label={profileCopy.depth}
                  note={profileCopy.depthNote}
                  value={researchProfile.analysisDepth}
                  options={profileCopy.depthOptions}
                  onChange={(value) => updateProfile("analysisDepth", value)}
                />
                <ProfileChoice
                  label={profileCopy.purpose}
                  note={profileCopy.purposeNote}
                  value={researchProfile.decisionPurpose}
                  options={profileCopy.purposeOptions}
                  onChange={(value) => updateProfile("decisionPurpose", value)}
                />
                <div className="research-profile__peers">
                  <div>
                    <strong>{profileCopy.peers}</strong>
                    <small>{profileCopy.peersNote}</small>
                  </div>
                  <div className="research-profile__peer-entry">
                    <input
                      value={comparisonDraft}
                      maxLength={5}
                      placeholder={profileCopy.peerPlaceholder}
                      onChange={(event) =>
                        setComparisonDraft(
                          event.target.value.replace(/[^a-z.]/giu, ""),
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        addComparisonSymbol();
                      }}
                    />
                    <button
                      type="button"
                      aria-label={detailCopy.addComparison}
                      disabled={researchProfile.comparisonSymbols.length >= 5}
                      onClick={addComparisonSymbol}
                    >
                      <Plus aria-hidden="true" size={15} />
                    </button>
                  </div>
                  <div className="research-profile__peer-list">
                    {researchProfile.comparisonSymbols.length === 0 ? (
                      <span>{profileCopy.noPeers}</span>
                    ) : (
                      researchProfile.comparisonSymbols.map((symbol) => (
                        <button
                          key={symbol}
                          type="button"
                          onClick={() =>
                            updateProfile(
                              "comparisonSymbols",
                              researchProfile.comparisonSymbols.filter(
                                (item) => item !== symbol,
                              ),
                            )
                          }
                        >
                          {symbol}
                          <X aria-hidden="true" size={11} />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="search-console__actions">
            <div className="search-console__left-actions">
              <button
                className="research-profile-trigger"
                type="button"
                aria-expanded={profileOpen}
                aria-controls="research-profile-panel"
                aria-label={profileCopy.customize}
                title={profileCopy.customize}
                aria-disabled={customSettingsLocked || undefined}
                data-locked={customSettingsLocked ? "true" : undefined}
                onClick={() => {
                  if (customSettingsLocked) {
                    setMembershipGateOpen(true);
                    return;
                  }
                  setTargetPickerOpen(false);
                  setProfileOpen((open) => !open);
                }}
              >
                {customSettingsLocked ? (
                  <LockKeyhole aria-hidden="true" size={16} />
                ) : (
                  <SlidersHorizontal aria-hidden="true" size={17} />
                )}
              </button>
              <ResearchExplanationModeControl
                locale={locale}
                value={researchProfile.explanationMode ?? "professional"}
                onChange={(value) => updateProfile("explanationMode", value)}
              />
            </div>
            <section className="research-target" aria-label={detailCopy.mode}>
              <button
                className="research-target__trigger"
                type="button"
                aria-expanded={targetPickerOpen}
                aria-haspopup="menu"
                title={recommendation.reason[researchLocale(locale)]}
                onClick={() => {
                  setProfileOpen(false);
                  setTargetPickerOpen((open) => !open);
                }}
              >
                <strong>{targetCopy}</strong>
                <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
              {targetPickerOpen ? (
                <div className="research-target__options" role="menu">
                  {[
                    {
                      target: COMMITTEE_RESEARCH_TARGET,
                      label: detailCopy.committee,
                      note: detailCopy.committeeNote,
                    },
                    ...(
                      ["market", "company", "financial", "risk"] as const
                    ).map((departmentId) => ({
                      target: {
                        kind: "department" as const,
                        departmentId,
                      },
                      label:
                        RESEARCH_DEPARTMENT_COPY[departmentId][
                          researchLocale(locale)
                        ],
                      note: detailCopy.teamNotes[departmentId],
                    })),
                  ].map((option) => {
                    const selected =
                      option.target.kind === researchTarget.kind &&
                      (option.target.kind === "committee" ||
                        (researchTarget.kind === "department" &&
                          option.target.departmentId ===
                            researchTarget.departmentId));
                    return (
                      <button
                        key={
                          option.target.kind === "committee"
                            ? "committee"
                            : option.target.departmentId
                        }
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => {
                          setTargetOverride(option.target);
                          setTargetPickerOpen(false);
                        }}
                      >
                        <strong>{option.label}</strong>
                        <small>{option.note}</small>
                      </button>
                    );
                  })}
                  {targetOverride === undefined ? null : (
                    <button
                      className="research-target__auto"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTargetOverride(undefined);
                        setTargetPickerOpen(false);
                      }}
                    >
                      {detailCopy.auto}
                    </button>
                  )}
                </div>
              ) : null}
            </section>
            <ResearchButton
              label={labels.action}
              loadingLabel={labels.loading}
              disabled={!canStartResearch}
              loading={isSubmitting}
            />
          </div>

          {submissionError === undefined ? null : (
            <p role="alert">{submissionError}</p>
          )}

          {hasQuery && hasResults && resultsOpen ? (
            <div
              className="search-results"
              role="listbox"
              aria-label={copy[locale].a11y.results}
            >
              {matches.map((ticker) => (
                <button
                  key={ticker.symbol}
                  type="button"
                  role="option"
                  aria-selected={selectedTicker?.symbol === ticker.symbol}
                  onClick={() => selectTicker(ticker)}
                >
                  <strong className="search-results__symbol">
                    {ticker.symbol}
                  </strong>
                  <span className="search-results__company">
                    <span>{ticker.company}</span>
                    <small>{ticker.sector}</small>
                  </span>
                  <span className="search-results__meta">
                    {ticker.exchange}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </form>
      </BorderBeam>
      <CreditShortageModal
        locale={researchLocale(locale)}
        open={creditShortageOpen}
        required={requiredCredits}
        remaining={creditsRemaining}
        onClose={() => setCreditShortageOpen(false)}
      />
      <MembershipAccessModal
        locale={researchLocale(locale)}
        open={membershipGateOpen}
        reason="customize"
        onClose={() => setMembershipGateOpen(false)}
        onOpenPlans={onOpenPlans}
      />
    </>
  );
}

function ProfileChoice<Value extends string>(props: {
  readonly label: string;
  readonly note: string;
  readonly value: Value;
  readonly options: Readonly<Record<Value, string>>;
  readonly disabled?: boolean;
  readonly onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="research-profile__choice">
      <legend>{props.label}</legend>
      <small>{props.note}</small>
      <div>
        {(Object.entries(props.options) as [Value, string][]).map(
          ([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={props.value === value}
              disabled={props.disabled}
              onClick={() => props.onChange(value)}
            >
              {label}
            </button>
          ),
        )}
      </div>
    </fieldset>
  );
}

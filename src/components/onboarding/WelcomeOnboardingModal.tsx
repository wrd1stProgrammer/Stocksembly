"use client";

import "../../styles/billing.css";
import "../../styles/onboarding.css";
import {
  ArrowRight,
  BarChart3,
  Languages,
  SearchCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  ONBOARDING_DISCOVERY_SOURCES,
  type OnboardingDiscoverySource,
} from "../../accounts/onboarding";
import { type AppLocale, researchLocale } from "../../lib/i18n";
import type { WhopPricingPlan } from "../../lib/whop/contracts";
import { CREDIT_COSTS } from "../../lib/whop/creditPolicy";
import { PricingPlansGrid } from "../billing/PricingPlansGrid";
import { subscriptionPlanCards } from "../billing/subscriptionPlanCards";

type WelcomeOnboardingModalProps = {
  readonly locale: AppLocale;
  readonly plans: readonly WhopPricingPlan[];
  readonly onComplete: (
    discoverySource: OnboardingDiscoverySource,
  ) => void | Promise<void>;
  readonly onOpenPlans: (
    discoverySource: OnboardingDiscoverySource,
  ) => void | Promise<void>;
};

type OnboardingCopy = {
  readonly progress: string;
  readonly skip: string;
  readonly next: string;
  readonly intentEyebrow: string;
  readonly intentTitle: string;
  readonly intentDescription: string;
  readonly intents: readonly [string, string, string, string];
  readonly discoveryEyebrow: string;
  readonly discoveryTitle: string;
  readonly discoveryDescription: string;
  readonly discoveryOptions: Readonly<
    Record<OnboardingDiscoverySource, string>
  >;
  readonly creditEyebrow: string;
  readonly creditTitle: string;
  readonly creditDescription: string;
  readonly room: string;
  readonly translation: string;
  readonly team: string;
  readonly committee: string;
  readonly creditUnit: string;
  readonly plansAction: string;
  readonly plansEyebrow: string;
  readonly plansTitle: string;
  readonly plansDescription: string;
  readonly comparePlans: string;
  readonly startFree: string;
  readonly saving: string;
  readonly error: string;
};

const englishCopy: OnboardingCopy = {
  progress: "Getting started",
  skip: "Skip",
  next: "Next",
  intentEyebrow: "Your first research",
  intentTitle: "Which investment decision should we make clearer first?",
  intentDescription:
    "Choose one. We will point you to the fastest way to experience Stocksembly.",
  intents: [
    "Before an earnings announcement",
    "When valuation feels unclear",
    "When I need to map downside risk",
    "When I am testing a new idea",
  ],
  discoveryEyebrow: "One quick question",
  discoveryTitle: "How did you hear about Stocksembly?",
  discoveryDescription:
    "Your answer helps us invest in the places that bring in serious investors.",
  discoveryOptions: {
    search: "Search",
    youtube: "YouTube",
    social: "Social media",
    community: "Investing community",
    recommendation: "Friend or colleague",
    other: "Other",
    prefer_not_to_say: "Prefer not to say",
  },
  creditEyebrow: "Your starting balance",
  creditTitle: "Your 5-credit welcome gift is ready",
  creditDescription:
    "Open one fresh Research Room report and translate it, or save credits toward your own agent research.",
  room: "Open Research Room report",
  translation: "Professional translation",
  team: "Individual team research",
  committee: "Full committee research",
  creditUnit: "credits",
  plansAction: "View plans",
  plansEyebrow: "Limited annual offer",
  plansTitle: "Go deeper and save two months",
  plansDescription:
    "Annual plans include the same monthly credit refill at a lower total price.",
  comparePlans: "Compare all plans",
  startFree: "Start with 5 credits",
  saving: "Saving…",
  error: "Could not save your choice. Please try again.",
};

const onboardingCopy: Readonly<Record<AppLocale, OnboardingCopy>> = {
  en: englishCopy,
  ko: {
    progress: "시작 안내",
    skip: "건너뛰기",
    next: "다음",
    intentEyebrow: "첫 리서치",
    intentTitle: "어떤 투자 판단부터 선명하게 만들까요?",
    intentDescription:
      "하나만 골라주세요. Stocksembly의 가치를 가장 빠르게 확인할 방법을 안내할게요.",
    intents: [
      "실적 발표 전에 확인할 때",
      "밸류에이션이 애매할 때",
      "하방 위험을 점검할 때",
      "새로운 투자 아이디어를 검증할 때",
    ],
    discoveryEyebrow: "간단한 설문",
    discoveryTitle: "Stocksembly를 어디서 알게 되셨나요?",
    discoveryDescription:
      "더 좋은 투자자들이 Stocksembly를 발견할 수 있도록 답변을 참고할게요.",
    discoveryOptions: {
      search: "검색",
      youtube: "유튜브",
      social: "소셜 미디어",
      community: "투자 커뮤니티",
      recommendation: "지인 추천",
      other: "기타",
      prefer_not_to_say: "응답하지 않음",
    },
    creditEyebrow: "첫 이용 크레딧",
    creditTitle: "가입 선물 5크레딧이 준비됐어요",
    creditDescription:
      "최신 리서치룸 보고서 1개를 열고 번역하거나, 나만의 에이전트 리서치를 위해 모아둘 수 있어요.",
    room: "리서치룸 열람",
    translation: "전문 번역",
    team: "개별 팀 리서치",
    committee: "전체 위원회 리서치",
    creditUnit: "크레딧",
    plansAction: "요금제 보기",
    plansEyebrow: "연간 특가",
    plansTitle: "더 깊게 볼 땐, 두 달을 아끼세요",
    plansDescription:
      "연간 플랜도 매달 크레딧이 충전되며, 월 결제 10개월 가격으로 1년을 이용합니다.",
    comparePlans: "전체 요금제 비교",
    startFree: "5크레딧으로 시작",
    saving: "저장 중…",
    error: "선택을 저장하지 못했습니다. 다시 시도해 주세요.",
  },
  ja: {
    ...englishCopy,
    progress: "スタートガイド",
    skip: "スキップ",
    next: "次へ",
    intentEyebrow: "最初のリサーチ",
    intentTitle: "どの投資判断から明確にしますか？",
    intentDescription:
      "一つ選ぶと、Stocksemblyを最も早く体験できる方法をご案内します。",
    intents: [
      "決算発表の前",
      "バリュエーションが曖昧な時",
      "下振れリスクを確認する時",
      "新しい投資アイデアを検証する時",
    ],
    creditEyebrow: "初回クレジット",
    creditTitle: "ウェルカム5クレジットを受け取りました",
    creditDescription:
      "最新レポートを1件開いて翻訳するか、エージェントリサーチ用に残せます。",
    room: "リサーチルーム閲覧",
    translation: "専門翻訳",
    team: "個別チームリサーチ",
    committee: "全委員会リサーチ",
    creditUnit: "クレジット",
    plansAction: "プランを見る",
    plansEyebrow: "年間特別価格",
    plansTitle: "深く調べるなら、2か月分お得に",
    plansDescription:
      "年間プランもクレジットは毎月補充され、10か月分の料金で1年間利用できます。",
    comparePlans: "全プランを比較",
    startFree: "5クレジットで始める",
    saving: "保存中…",
    error: "保存できませんでした。もう一度お試しください。",
  },
  "zh-TW": {
    ...englishCopy,
    progress: "開始導覽",
    skip: "略過",
    next: "下一步",
    intentEyebrow: "首次研究",
    intentTitle: "先釐清哪一項投資判斷？",
    intentDescription: "選擇一項，我們會引導你最快體驗 Stocksembly。",
    intents: [
      "財報公布前",
      "估值難以判斷時",
      "需要評估下行風險時",
      "驗證新投資想法時",
    ],
    creditEyebrow: "初始點數",
    creditTitle: "5 點迎新點數已就緒",
    creditDescription: "可開啟一份最新研究並翻譯，或留給你的代理研究。",
    room: "開啟研究室報告",
    translation: "專業翻譯",
    team: "單一團隊研究",
    committee: "全委員會研究",
    creditUnit: "點",
    plansAction: "查看方案",
    plansEyebrow: "年度優惠",
    plansTitle: "深入研究，省下兩個月",
    plansDescription: "年繳方案仍按月補充點數，以十個月價格使用一年。",
    comparePlans: "比較所有方案",
    startFree: "用 5 點開始",
    saving: "儲存中…",
    error: "無法儲存，請再試一次。",
  },
  es: {
    ...englishCopy,
    progress: "Guía inicial",
    skip: "Omitir",
    next: "Siguiente",
    intentEyebrow: "Tu primer análisis",
    intentTitle: "¿Qué decisión de inversión aclaramos primero?",
    intentDescription:
      "Elige una opción y te mostraremos la forma más rápida de probar Stocksembly.",
    intents: [
      "Antes de resultados",
      "Cuando la valoración no está clara",
      "Al evaluar el riesgo bajista",
      "Al validar una idea nueva",
    ],
    creditEyebrow: "Créditos iniciales",
    creditTitle: "Tus 5 créditos de bienvenida están listos",
    creditDescription:
      "Abre y traduce un informe reciente o guárdalos para tu propio análisis con agentes.",
    room: "Abrir informe de Research Room",
    translation: "Traducción profesional",
    team: "Análisis de un equipo",
    committee: "Análisis del comité completo",
    creditUnit: "créditos",
    plansAction: "Ver planes",
    plansEyebrow: "Oferta anual",
    plansTitle: "Profundiza y ahorra dos meses",
    plansDescription:
      "Los créditos se renuevan cada mes y pagas diez meses por un año.",
    comparePlans: "Comparar planes",
    startFree: "Empezar con 5 créditos",
    saving: "Guardando…",
    error: "No pudimos guardar tu elección. Inténtalo de nuevo.",
  },
  "pt-BR": {
    ...englishCopy,
    progress: "Guia inicial",
    skip: "Pular",
    next: "Próximo",
    intentEyebrow: "Sua primeira pesquisa",
    intentTitle: "Qual decisão de investimento vamos esclarecer primeiro?",
    intentDescription:
      "Escolha uma opção e indicaremos o jeito mais rápido de testar o Stocksembly.",
    intents: [
      "Antes da divulgação de resultados",
      "Quando o valuation não está claro",
      "Ao avaliar o risco de queda",
      "Ao validar uma nova ideia",
    ],
    creditEyebrow: "Créditos iniciais",
    creditTitle: "Seus 5 créditos de boas-vindas estão prontos",
    creditDescription:
      "Abra e traduza um relatório recente ou guarde para sua própria pesquisa com agentes.",
    room: "Abrir relatório da sala",
    translation: "Tradução profissional",
    team: "Pesquisa de uma equipe",
    committee: "Pesquisa do comitê completo",
    creditUnit: "créditos",
    plansAction: "Ver planos",
    plansEyebrow: "Oferta anual",
    plansTitle: "Aprofunde e economize dois meses",
    plansDescription:
      "Os créditos renovam todo mês e você paga dez meses por um ano.",
    comparePlans: "Comparar todos os planos",
    startFree: "Começar com 5 créditos",
    saving: "Salvando…",
    error: "Não foi possível salvar. Tente novamente.",
  },
  de: {
    ...englishCopy,
    progress: "Einführung",
    skip: "Überspringen",
    next: "Weiter",
    intentEyebrow: "Deine erste Analyse",
    intentTitle: "Welche Anlageentscheidung klären wir zuerst?",
    intentDescription:
      "Wähle eine Option und wir zeigen dir den schnellsten Einstieg in Stocksembly.",
    intents: [
      "Vor den Quartalszahlen",
      "Wenn die Bewertung unklar ist",
      "Bei der Prüfung des Abwärtsrisikos",
      "Beim Testen einer neuen Idee",
    ],
    creditEyebrow: "Startguthaben",
    creditTitle: "Deine 5 Willkommens-Credits sind bereit",
    creditDescription:
      "Öffne und übersetze einen aktuellen Bericht oder spare für deine eigene Agenten-Analyse.",
    room: "Research-Room-Bericht öffnen",
    translation: "Professionelle Übersetzung",
    team: "Analyse eines Teams",
    committee: "Analyse des gesamten Komitees",
    creditUnit: "Credits",
    plansAction: "Tarife ansehen",
    plansEyebrow: "Jahresangebot",
    plansTitle: "Tiefer analysieren, zwei Monate sparen",
    plansDescription:
      "Credits werden monatlich erneuert; ein Jahr kostet nur zehn Monatsraten.",
    comparePlans: "Alle Tarife vergleichen",
    startFree: "Mit 5 Credits starten",
    saving: "Wird gespeichert…",
    error: "Auswahl konnte nicht gespeichert werden. Bitte erneut versuchen.",
  },
  fr: {
    ...englishCopy,
    progress: "Guide de démarrage",
    skip: "Passer",
    next: "Suivant",
    intentEyebrow: "Votre première recherche",
    intentTitle: "Quelle décision d’investissement clarifier en premier ?",
    intentDescription:
      "Choisissez une option et découvrez rapidement la valeur de Stocksembly.",
    intents: [
      "Avant la publication des résultats",
      "Quand la valorisation est incertaine",
      "Pour évaluer le risque baissier",
      "Pour tester une nouvelle idée",
    ],
    creditEyebrow: "Crédits de départ",
    creditTitle: "Vos 5 crédits de bienvenue sont prêts",
    creditDescription:
      "Ouvrez et traduisez un rapport récent ou gardez-les pour votre propre recherche par agents.",
    room: "Ouvrir un rapport Research Room",
    translation: "Traduction professionnelle",
    team: "Recherche d’une équipe",
    committee: "Recherche du comité complet",
    creditUnit: "crédits",
    plansAction: "Voir les offres",
    plansEyebrow: "Offre annuelle",
    plansTitle: "Approfondissez et économisez deux mois",
    plansDescription:
      "Les crédits sont renouvelés chaque mois et l’année coûte dix mensualités.",
    comparePlans: "Comparer toutes les offres",
    startFree: "Commencer avec 5 crédits",
    saving: "Enregistrement…",
    error: "Impossible d’enregistrer. Veuillez réessayer.",
  },
};

const costItems = [
  [SearchCheck, "room", CREDIT_COSTS.researchRoomView],
  [Languages, "translation", CREDIT_COSTS.researchTranslation],
  [BarChart3, "team", CREDIT_COSTS.departmentResearch],
  [Users, "committee", CREDIT_COSTS.committeeResearch],
] as const;

export function WelcomeOnboardingModal({
  locale,
  plans,
  onComplete,
  onOpenPlans,
}: WelcomeOnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<number>();
  const [discoverySource, setDiscoverySource] =
    useState<OnboardingDiscoverySource>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const content = onboardingCopy[locale];
  const pricingLocale = researchLocale(locale);
  const planCards = useMemo(
    () => subscriptionPlanCards(plans, pricingLocale),
    [plans, pricingLocale],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const finish = async (openPlans: boolean) => {
    if (!openPlans) setSaving(true);
    setError(false);
    try {
      const source = discoverySource ?? "prefer_not_to_say";
      await (openPlans ? onOpenPlans(source) : onComplete(source));
    } catch {
      setSaving(false);
      setError(true);
    }
  };

  return (
    <div className="welcome-onboarding" role="presentation">
      <dialog
        open
        className="welcome-onboarding__dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="welcome-onboarding__header">
          <a
            href={`/?lang=${encodeURIComponent(locale)}`}
            aria-label="Stocksembly home"
          >
            <span className="welcome-onboarding__brand-mark" aria-hidden="true">
              ✦
            </span>
            Stocksembly
          </a>
          <div
            className="welcome-onboarding__progress"
            role="progressbar"
            aria-label={content.progress}
            aria-valuemin={1}
            aria-valuemax={4}
            aria-valuenow={step + 1}
          >
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className="welcome-onboarding__progress-segment"
                data-active={index <= step}
              />
            ))}
          </div>
        </header>

        <div className="welcome-onboarding__content" data-step={step}>
          {step === 0 ? (
            <>
              <p className="welcome-onboarding__eyebrow">
                {content.intentEyebrow}
              </p>
              <h2 id={titleId}>{content.intentTitle}</h2>
              <p id={descriptionId} className="welcome-onboarding__description">
                {content.intentDescription}
              </p>
              <div className="welcome-onboarding__intents">
                {content.intents.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={intent === index}
                    onClick={() => setIntent(index)}
                  >
                    <span className="welcome-onboarding__intent-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <strong>{label}</strong>
                    <span
                      className="welcome-onboarding__choice-radio"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="welcome-onboarding__primary"
                disabled={intent === undefined}
                onClick={() => setStep(1)}
              >
                {content.next}
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <p className="welcome-onboarding__eyebrow">
                {content.discoveryEyebrow}
              </p>
              <h2 id={titleId}>{content.discoveryTitle}</h2>
              <p id={descriptionId} className="welcome-onboarding__description">
                {content.discoveryDescription}
              </p>
              <div className="welcome-onboarding__discovery-options">
                {ONBOARDING_DISCOVERY_SOURCES.filter(
                  (source) => source !== "prefer_not_to_say",
                ).map((source) => (
                  <button
                    key={source}
                    type="button"
                    aria-pressed={discoverySource === source}
                    onClick={() => setDiscoverySource(source)}
                  >
                    <strong>{content.discoveryOptions[source]}</strong>
                    <span
                      className="welcome-onboarding__choice-radio"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="welcome-onboarding__primary"
                disabled={discoverySource === undefined}
                onClick={() => setStep(2)}
              >
                {content.next}
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="welcome-onboarding__eyebrow">
                {content.creditEyebrow}
              </p>
              <h2 id={titleId}>{content.creditTitle}</h2>
              <p id={descriptionId} className="welcome-onboarding__description">
                {content.creditDescription}
              </p>
              <div className="welcome-onboarding__costs">
                {costItems.map(([Icon, key, cost]) => (
                  <article key={key}>
                    <Icon aria-hidden="true" size={19} />
                    <span className="welcome-onboarding__cost-label">
                      {content[key]}
                    </span>
                    <strong>
                      {cost}
                      {content.creditUnit}
                    </strong>
                  </article>
                ))}
              </div>
              <button
                type="button"
                className="welcome-onboarding__primary"
                onClick={() => setStep(3)}
              >
                {content.plansAction}
                <ArrowRight aria-hidden="true" size={18} />
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="welcome-onboarding__eyebrow">
                {content.plansEyebrow}
              </p>
              <h2 id={titleId}>{content.plansTitle}</h2>
              <p id={descriptionId} className="welcome-onboarding__description">
                {content.plansDescription}
              </p>
              <div className="welcome-onboarding__plans">
                <PricingPlansGrid
                  plans={planCards}
                  locale={pricingLocale}
                  initialCycle="annual"
                  onFreeSelect={() => void finish(false)}
                  onPaidSelect={() => void finish(true)}
                />
              </div>
              {error ? (
                <p className="welcome-onboarding__error">{content.error}</p>
              ) : null}
              <div className="welcome-onboarding__actions">
                <button
                  type="button"
                  onClick={() => void finish(true)}
                  disabled={saving}
                >
                  {content.comparePlans}
                </button>
                <button
                  type="button"
                  className="welcome-onboarding__primary"
                  onClick={() => void finish(false)}
                  disabled={saving}
                >
                  <Sparkles aria-hidden="true" size={18} />
                  {saving ? content.saving : content.startFree}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}

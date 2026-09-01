"use client";

import "../styles/signed-in-sidebar.css";
import {
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  signOut,
} from "aws-amplify/auth";
import {
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  FileText,
  Home,
  Languages,
  LibraryBig,
  LogOut,
  PanelLeft,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyLocalePreference,
  persistAccountLocale,
} from "../auth/localePreference";
import { createAuthenticatedResearchClient } from "../auth/researchClient";
import { clearResearchSession } from "../auth/researchSession";
import {
  type AppLocale,
  copy,
  intlLocale,
  localeDetails,
  locales,
  researchLocale,
} from "../lib/i18n";
import type { PublicRun } from "../research/client/schemas";
import { Brand } from "./Brand";
import { SidebarSubscriptionModal } from "./billing/SidebarSubscriptionModal";
import { CompanyLogo } from "./research/ResearchSidebar";
import {
  type SignedInSidebarActiveItem,
  SignedInSidebarNavigation,
} from "./SignedInSidebarNavigation";

type SignedInSidebarProps = {
  readonly locale: AppLocale;
  readonly collapsed: boolean;
  readonly mobileContext?: {
    readonly eyebrow: string;
    readonly title: string;
  };
  readonly onCollapsedChange: (collapsed: boolean) => void;
  readonly onLocaleChange: (locale: AppLocale) => void;
  readonly onSignedOut: () => void;
  readonly onOpenSubscription?: () => void;
  readonly subscriptionTier?: "unknown" | "free" | "paid";
  readonly activeItem?: SignedInSidebarActiveItem;
};

export const SIGNED_IN_SIDEBAR_STORAGE_KEY =
  "stocksembly:signed-in-sidebar-collapsed";
export { PREFERRED_LOCALE_STORAGE_KEY } from "../auth/localePreference";

const BRIEFINGS_READ_EVENT = "stocksembly:briefings-read";

type LoadState = "loading" | "ready" | "failed";

const LOAD_RETRY_DELAYS_MS = [0, 250, 800, 1_600] as const;

async function wait(delayMs: number): Promise<void> {
  if (delayMs === 0) return;
  await new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

type HistoryGroup = {
  readonly symbol: string;
  readonly runs: readonly PublicRun[];
};

type SidebarCopy = {
  readonly workspaceSidebar: string;
  readonly expandSidebar: string;
  readonly collapseSidebar: string;
  readonly closeSidebar: string;
  readonly recentResearch: string;
  readonly loadingRecent: string;
  readonly tryAgain: string;
  readonly noRecent: string;
  readonly analyses: string;
  readonly researching: string;
  readonly complete: string;
  readonly stopped: string;
  readonly openAccount: string;
  readonly upgrade: string;
  readonly signedInUser: string;
  readonly manageSubscription: string;
  readonly viewMembership: string;
  readonly myResearch: string;
  readonly researchRoom: string;
  readonly support: string;
  readonly home: string;
  readonly signOut: string;
};

const sidebarCopy: Readonly<Record<AppLocale, SidebarCopy>> = {
  en: {
    workspaceSidebar: "Workspace sidebar",
    expandSidebar: "Expand left sidebar",
    collapseSidebar: "Collapse left sidebar",
    closeSidebar: "Close sidebar",
    recentResearch: "Recent research",
    loadingRecent: "Loading recent research",
    tryAgain: "Try again",
    noRecent: "No recent research",
    analyses: "analyses",
    researching: "Researching",
    complete: "Complete",
    stopped: "Stopped",
    openAccount: "Open account menu",
    upgrade: "Upgrade",
    signedInUser: "Signed-in user",
    manageSubscription: "Manage subscription",
    viewMembership: "View membership",
    myResearch: "My research",
    researchRoom: "Research room",
    support: "Support",
    home: "Home",
    signOut: "Sign out",
  },
  ko: {
    workspaceSidebar: "워크스페이스 사이드바",
    expandSidebar: "좌측 사이드바 펼치기",
    collapseSidebar: "좌측 사이드바 접기",
    closeSidebar: "사이드바 닫기",
    recentResearch: "최근 항목",
    loadingRecent: "최근 리서치 불러오는 중",
    tryAgain: "다시 시도",
    noRecent: "아직 리서치 기록이 없습니다.",
    analyses: "개 분석",
    researching: "분석 중",
    complete: "완료",
    stopped: "중단됨",
    openAccount: "계정 메뉴 열기",
    upgrade: "업그레이드",
    signedInUser: "로그인 사용자",
    manageSubscription: "구독 관리",
    viewMembership: "멤버십 보기",
    myResearch: "내 리서치",
    researchRoom: "리서치룸",
    support: "고객 지원",
    home: "홈",
    signOut: "로그아웃",
  },
  ja: {
    workspaceSidebar: "ワークスペースのサイドバー",
    expandSidebar: "左サイドバーを開く",
    collapseSidebar: "左サイドバーを閉じる",
    closeSidebar: "サイドバーを閉じる",
    recentResearch: "最近のリサーチ",
    loadingRecent: "最近のリサーチを読み込み中",
    tryAgain: "再試行",
    noRecent: "最近のリサーチはありません",
    analyses: "件の分析",
    researching: "分析中",
    complete: "完了",
    stopped: "中断",
    openAccount: "アカウントメニューを開く",
    upgrade: "アップグレード",
    signedInUser: "ログイン中のユーザー",
    manageSubscription: "サブスクリプション管理",
    viewMembership: "メンバーシップを見る",
    myResearch: "自分のリサーチ",
    researchRoom: "リサーチルーム",
    support: "サポート",
    home: "ホーム",
    signOut: "ログアウト",
  },
  "zh-TW": {
    workspaceSidebar: "工作區側邊欄",
    expandSidebar: "展開左側邊欄",
    collapseSidebar: "收合左側邊欄",
    closeSidebar: "關閉側邊欄",
    recentResearch: "最近研究",
    loadingRecent: "正在載入最近研究",
    tryAgain: "再試一次",
    noRecent: "尚無最近研究",
    analyses: "份分析",
    researching: "分析中",
    complete: "已完成",
    stopped: "已中止",
    openAccount: "開啟帳戶選單",
    upgrade: "升級",
    signedInUser: "已登入使用者",
    manageSubscription: "管理訂閱",
    viewMembership: "查看會員方案",
    myResearch: "我的研究",
    researchRoom: "研究室",
    support: "支援",
    home: "首頁",
    signOut: "登出",
  },
  es: {
    workspaceSidebar: "Barra lateral del espacio de trabajo",
    expandSidebar: "Abrir barra lateral izquierda",
    collapseSidebar: "Cerrar barra lateral izquierda",
    closeSidebar: "Cerrar barra lateral",
    recentResearch: "Análisis recientes",
    loadingRecent: "Cargando análisis recientes",
    tryAgain: "Reintentar",
    noRecent: "No hay análisis recientes",
    analyses: "análisis",
    researching: "Analizando",
    complete: "Completado",
    stopped: "Detenido",
    openAccount: "Abrir menú de cuenta",
    upgrade: "Mejorar plan",
    signedInUser: "Usuario conectado",
    manageSubscription: "Gestionar suscripción",
    viewMembership: "Ver membresía",
    myResearch: "Mis análisis",
    researchRoom: "Sala de análisis",
    support: "Soporte",
    home: "Inicio",
    signOut: "Cerrar sesión",
  },
  "pt-BR": {
    workspaceSidebar: "Barra lateral da área de trabalho",
    expandSidebar: "Abrir barra lateral esquerda",
    collapseSidebar: "Fechar barra lateral esquerda",
    closeSidebar: "Fechar barra lateral",
    recentResearch: "Pesquisas recentes",
    loadingRecent: "Carregando pesquisas recentes",
    tryAgain: "Tentar novamente",
    noRecent: "Nenhuma pesquisa recente",
    analyses: "análises",
    researching: "Analisando",
    complete: "Concluído",
    stopped: "Interrompido",
    openAccount: "Abrir menu da conta",
    upgrade: "Fazer upgrade",
    signedInUser: "Usuário conectado",
    manageSubscription: "Gerenciar assinatura",
    viewMembership: "Ver assinatura",
    myResearch: "Minhas pesquisas",
    researchRoom: "Sala de pesquisa",
    support: "Suporte",
    home: "Início",
    signOut: "Sair",
  },
  de: {
    workspaceSidebar: "Arbeitsbereich-Seitenleiste",
    expandSidebar: "Linke Seitenleiste öffnen",
    collapseSidebar: "Linke Seitenleiste schließen",
    closeSidebar: "Seitenleiste schließen",
    recentResearch: "Letzte Analysen",
    loadingRecent: "Letzte Analysen werden geladen",
    tryAgain: "Erneut versuchen",
    noRecent: "Keine aktuellen Analysen",
    analyses: "Analysen",
    researching: "In Analyse",
    complete: "Abgeschlossen",
    stopped: "Angehalten",
    openAccount: "Kontomenü öffnen",
    upgrade: "Upgrade",
    signedInUser: "Angemeldeter Benutzer",
    manageSubscription: "Abo verwalten",
    viewMembership: "Mitgliedschaft ansehen",
    myResearch: "Meine Analysen",
    researchRoom: "Research-Raum",
    support: "Support",
    home: "Startseite",
    signOut: "Abmelden",
  },
  fr: {
    workspaceSidebar: "Barre latérale de l’espace de travail",
    expandSidebar: "Ouvrir la barre latérale gauche",
    collapseSidebar: "Fermer la barre latérale gauche",
    closeSidebar: "Fermer la barre latérale",
    recentResearch: "Recherches récentes",
    loadingRecent: "Chargement des recherches récentes",
    tryAgain: "Réessayer",
    noRecent: "Aucune recherche récente",
    analyses: "analyses",
    researching: "Analyse en cours",
    complete: "Terminé",
    stopped: "Interrompu",
    openAccount: "Ouvrir le menu du compte",
    upgrade: "Mettre à niveau",
    signedInUser: "Utilisateur connecté",
    manageSubscription: "Gérer l’abonnement",
    viewMembership: "Voir l’abonnement",
    myResearch: "Mes recherches",
    researchRoom: "Salle de recherche",
    support: "Assistance",
    home: "Accueil",
    signOut: "Se déconnecter",
  },
};

function statusLabel(status: PublicRun["status"], locale: AppLocale) {
  const messages = sidebarCopy[locale];
  if (status === "queued" || status === "running" || status === "cancelling") {
    return messages.researching;
  }
  if (status === "completed" || status === "complete-with-limitations") {
    return messages.complete;
  }
  return messages.stopped;
}

function dateLabel(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function SignedInSidebar({
  locale,
  collapsed,
  mobileContext,
  onCollapsedChange,
  onLocaleChange,
  onSignedOut,
  onOpenSubscription,
  subscriptionTier = "unknown",
  activeItem = "dashboard",
}: SignedInSidebarProps) {
  const messages = sidebarCopy[locale];
  const [runs, setRuns] = useState<readonly PublicRun[]>([]);
  const [briefingUnread, setBriefingUnread] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [profileOpen, setProfileOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [identity, setIdentity] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState<string>();
  const profileWrapRef = useRef<HTMLDivElement>(null);

  const loadRuns = useCallback(async () => {
    setLoadState("loading");
    const client = createAuthenticatedResearchClient();
    let lastError: unknown;
    for (const delayMs of LOAD_RETRY_DELAYS_MS) {
      await wait(delayMs);
      try {
        await client.bootstrapSession();
        setRuns((await client.listRuns?.(12)) ?? []);
        const briefingResponse = await fetch(
          `/api/briefings?locale=${researchLocale(locale)}`,
          { credentials: "same-origin", cache: "no-store" },
        ).catch(() => undefined);
        if (briefingResponse?.ok) {
          const value = (await briefingResponse.json()) as {
            readonly unreadCount?: number;
          };
          setBriefingUnread(
            activeItem === "briefing-room"
              ? 0
              : Math.max(0, value.unreadCount ?? 0),
          );
        }
        setLoadState("ready");
        return;
      } catch (error) {
        lastError = error;
      }
    }
    if (process.env.NODE_ENV !== "production")
      console.error("SIDEBAR_RECENT_RESEARCH_LOAD_FAILED", lastError);
    setLoadState("failed");
  }, [activeItem, locale]);

  useEffect(() => {
    void loadRuns();
    void getCurrentUser()
      .then(async (user) => {
        const [attributes, session] = await Promise.all([
          fetchUserAttributes().catch(() => undefined),
          fetchAuthSession().catch(() => undefined),
        ]);
        const payload = session?.tokens?.idToken?.payload;
        const emailFromToken =
          typeof payload?.["email"] === "string" ? payload["email"] : undefined;
        const pictureFromToken =
          typeof payload?.["picture"] === "string"
            ? payload["picture"]
            : undefined;
        const picture = attributes?.picture ?? pictureFromToken;
        setIdentity(attributes?.email ?? emailFromToken ?? user.username ?? "");
        setProfileImageUrl(
          picture?.startsWith("https://") ? picture : undefined,
        );
      })
      .catch(() => undefined);
  }, [loadRuns]);

  useEffect(() => {
    const clearUnread = () => setBriefingUnread(0);
    window.addEventListener(BRIEFINGS_READ_EVENT, clearUnread);
    return () => window.removeEventListener(BRIEFINGS_READ_EVENT, clearUnread);
  }, []);

  useEffect(() => {
    if (!profileOpen) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !profileWrapRef.current?.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (languageOpen) setLanguageOpen(false);
      else setProfileOpen(false);
    };
    window.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("keydown", closeFromKeyboard);
    return () => {
      window.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [languageOpen, profileOpen]);

  useEffect(() => {
    if (!profileOpen) setLanguageOpen(false);
  }, [profileOpen]);

  const historyGroups = useMemo<readonly HistoryGroup[]>(() => {
    const grouped = new Map<string, PublicRun[]>();
    for (const run of runs) {
      const group = grouped.get(run.symbol) ?? [];
      group.push(run);
      grouped.set(run.symbol, group);
    }
    return [...grouped.entries()].map(([symbol, groupedRuns]) => ({
      symbol,
      runs: groupedRuns,
    }));
  }, [runs]);

  async function handleSignOut() {
    setProfileOpen(false);
    await signOut().catch(() => undefined);
    await clearResearchSession().catch(() => undefined);
    onSignedOut();
  }

  function handleOpenSubscription() {
    setProfileOpen(false);
    if (onOpenSubscription) {
      onOpenSubscription();
      return;
    }
    setSubscriptionModalOpen(true);
  }

  function handleLocaleSelection(nextLocale: AppLocale) {
    setLanguageOpen(false);
    applyLocalePreference(nextLocale, { updateUrl: true });
    onLocaleChange(nextLocale);
    void persistAccountLocale(nextLocale);
  }

  function handleCollapsedChange(next: boolean) {
    window.localStorage.setItem(SIGNED_IN_SIDEBAR_STORAGE_KEY, String(next));
    onCollapsedChange(next);
  }

  function preserveCollapsedNavigation() {
    window.localStorage.setItem(SIGNED_IN_SIDEBAR_STORAGE_KEY, "true");
  }

  const profileAvatar = (
    <span className="signed-in-sidebar__profile-avatar">
      {profileImageUrl ? (
        <Image
          src={profileImageUrl}
          alt=""
          width={38}
          height={38}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setProfileImageUrl(undefined)}
        />
      ) : (
        <UserRound size={17} aria-hidden="true" />
      )}
    </span>
  );

  return (
    <aside
      className="signed-in-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      data-mobile-context={mobileContext === undefined ? undefined : "true"}
      aria-label={messages.workspaceSidebar}
    >
      <div className="signed-in-sidebar__top">
        <Brand locale={locale} />
        {mobileContext === undefined ? null : (
          <div className="signed-in-sidebar__mobile-context">
            <span>{mobileContext.eyebrow}</span>
            <strong>{mobileContext.title}</strong>
          </div>
        )}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls="signed-in-sidebar-content"
          aria-label={
            collapsed ? messages.expandSidebar : messages.collapseSidebar
          }
          onClick={() => handleCollapsedChange(!collapsed)}
        >
          <span className="signed-in-sidebar__toggle-brand" aria-hidden="true">
            <Image
              src="/brand/stocksembly-mark-v2.png"
              alt=""
              width={24}
              height={24}
            />
          </span>
          <span className="signed-in-sidebar__toggle-panel" aria-hidden="true">
            <PanelLeft size={18} />
          </span>
        </button>
      </div>

      <SignedInSidebarNavigation
        locale={locale}
        collapsed={collapsed}
        variant="compact"
        activeItem={activeItem}
        briefingUnread={briefingUnread}
        onCompactNavigate={preserveCollapsedNavigation}
      />

      <button
        type="button"
        className="signed-in-sidebar__backdrop"
        aria-label={messages.closeSidebar}
        aria-hidden={collapsed}
        tabIndex={collapsed ? -1 : 0}
        onClick={() => handleCollapsedChange(true)}
      />

      <div className="signed-in-sidebar__drawer">
        <div
          className="signed-in-sidebar__content"
          id="signed-in-sidebar-content"
          aria-hidden={collapsed}
        >
          <SignedInSidebarNavigation
            locale={locale}
            collapsed={collapsed}
            variant="expanded"
            activeItem={activeItem}
            briefingUnread={briefingUnread}
            onCompactNavigate={preserveCollapsedNavigation}
          />
          <section
            className="signed-in-sidebar__history"
            aria-labelledby="signed-in-history-title"
          >
            <header>
              <span id="signed-in-history-title">
                {messages.recentResearch}
              </span>
              <Clock3 size={14} aria-hidden="true" />
            </header>
            {loadState === "loading" ? (
              <div className="signed-in-sidebar__history-loading" role="status">
                <i />
                <i />
                <span className="sr-only">{messages.loadingRecent}</span>
              </div>
            ) : loadState === "failed" ? (
              <button type="button" onClick={() => void loadRuns()}>
                {messages.tryAgain}
              </button>
            ) : historyGroups.length === 0 ? (
              <p>{messages.noRecent}</p>
            ) : (
              <div className="signed-in-sidebar__history-groups">
                {historyGroups.map((group) => (
                  <details key={group.symbol}>
                    <summary>
                      <CompanyLogo symbol={group.symbol} />
                      <span>
                        <strong>{group.symbol}</strong>
                        <small>
                          {group.runs.length} {messages.analyses}
                        </small>
                      </span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </summary>
                    <ol>
                      {group.runs.map((run) => (
                        <li key={run.runId}>
                          <Link
                            href={`/research/${run.symbol}?run=${run.runId}&lang=${locale}`}
                          >
                            <Clock3 size={14} aria-hidden="true" />
                            <span>
                              <strong>{statusLabel(run.status, locale)}</strong>
                              <time dateTime={run.createdAt}>
                                {dateLabel(run.createdAt, locale)}
                              </time>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </details>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="signed-in-sidebar__footer">
          <div className="signed-in-sidebar__profile-wrap" ref={profileWrapRef}>
            <div className="signed-in-sidebar__profile-row">
              <button
                type="button"
                className="signed-in-sidebar__profile-trigger"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-label={messages.openAccount}
                onClick={() => setProfileOpen((open) => !open)}
              >
                {profileAvatar}
              </button>
              {subscriptionTier === "free" ? (
                <button
                  type="button"
                  className="signed-in-sidebar__upgrade-link"
                  onClick={handleOpenSubscription}
                >
                  <CreditCard size={14} aria-hidden="true" />
                  <span>{messages.upgrade}</span>
                </button>
              ) : null}
            </div>
            {profileOpen ? (
              <div className="signed-in-sidebar__profile-menu" role="menu">
                <header>
                  {profileAvatar}
                  <strong>{identity || messages.signedInUser}</strong>
                </header>
                <div className="signed-in-sidebar__profile-menu-group">
                  <button
                    type="button"
                    className="signed-in-sidebar__subscription-action"
                    role="menuitem"
                    onClick={handleOpenSubscription}
                  >
                    <CreditCard size={18} />
                    <span>
                      {subscriptionTier === "free"
                        ? messages.upgrade
                        : subscriptionTier === "paid"
                          ? messages.manageSubscription
                          : messages.viewMembership}
                    </span>
                    <ChevronRight size={16} />
                  </button>
                  <Link href={`/?lang=${locale}#research`} role="menuitem">
                    <UserRound size={18} />
                    <span>{messages.myResearch}</span>
                  </Link>
                  <Link href={`/research-room?lang=${locale}`} role="menuitem">
                    <LibraryBig size={18} />
                    <span>{messages.researchRoom}</span>
                  </Link>
                  <div className="signed-in-sidebar__language-entry">
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={languageOpen}
                      onClick={() => setLanguageOpen((open) => !open)}
                    >
                      <Languages size={18} />
                      <span>{copy[locale].a11y.language}</span>
                      <small>{localeDetails[locale].nativeLabel}</small>
                      <ChevronRight size={16} />
                    </button>
                    {languageOpen ? (
                      <div
                        className="signed-in-sidebar__language-menu"
                        role="menu"
                        aria-label={copy[locale].a11y.language}
                      >
                        <p>{copy[locale].a11y.language}</p>
                        {locales.map((value) => (
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={locale === value}
                            key={value}
                            onClick={() => void handleLocaleSelection(value)}
                          >
                            <span>
                              <strong>
                                {localeDetails[value].nativeLabel}
                              </strong>
                              <small>{localeDetails[value].label}</small>
                            </span>
                            {locale === value ? <Check size={15} /> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="signed-in-sidebar__profile-menu-group">
                  <a href="mailto:kicoa24@gmail.com" role="menuitem">
                    <CircleHelp size={18} />
                    <span>{messages.support}</span>
                    <ChevronRight size={16} />
                  </a>
                  <Link href="/terms" role="menuitem">
                    <FileText size={18} />
                    <span>{copy[locale].footer.terms}</span>
                    <ChevronRight size={16} />
                  </Link>
                  <Link href="/privacy" role="menuitem">
                    <ShieldCheck size={18} />
                    <span>{copy[locale].footer.privacy}</span>
                    <ChevronRight size={16} />
                  </Link>
                  <Link href="/disclaimer" role="menuitem">
                    <Scale size={18} />
                    <span>{copy[locale].footer.disclaimerLabel}</span>
                    <ChevronRight size={16} />
                  </Link>
                  <Link href="/risk-disclosure" role="menuitem">
                    <ShieldAlert size={18} />
                    <span>{copy[locale].footer.risk}</span>
                    <ChevronRight size={16} />
                  </Link>
                  <Link href={`/?lang=${locale}`} role="menuitem">
                    <Home size={18} />
                    <span>{messages.home}</span>
                  </Link>
                </div>
                <div className="signed-in-sidebar__profile-menu-group">
                  <button
                    type="button"
                    className="signed-in-sidebar__profile-logout"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                  >
                    <LogOut size={18} />
                    <span>{messages.signOut}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </footer>
      </div>
      {onOpenSubscription === undefined ? (
        <SidebarSubscriptionModal
          open={subscriptionModalOpen}
          locale={researchLocale(locale)}
          initialTier={subscriptionTier}
          onClose={() => setSubscriptionModalOpen(false)}
        />
      ) : null}
    </aside>
  );
}

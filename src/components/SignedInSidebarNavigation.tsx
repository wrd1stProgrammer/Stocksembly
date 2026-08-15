import {
  BellRing,
  BookOpenText,
  LayoutDashboard,
  LibraryBig,
  Newspaper,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { editorialNavigationCopy } from "../editorial/navigationCopy";
import type { AppLocale, UiMessages } from "../lib/i18n";
import { uiMessage } from "../lib/i18n";

export type SignedInSidebarActiveItem =
  | "home"
  | "dashboard"
  | "research-room"
  | "briefing-room"
  | "blog"
  | "glossary";

type NavigationProps = Readonly<{
  locale: AppLocale;
  collapsed: boolean;
  variant: "compact" | "expanded";
  activeItem: SignedInSidebarActiveItem;
  briefingUnread: number;
  onCompactNavigate: () => void;
}>;

const labels: Readonly<
  Record<"dashboard" | "research" | "briefing", UiMessages>
> = {
  dashboard: {
    en: "Dashboard",
    ko: "대시보드",
    ja: "ダッシュボード",
    "zh-TW": "儀表板",
    es: "Panel",
    "pt-BR": "Painel",
    de: "Dashboard",
    fr: "Tableau de bord",
  },
  research: {
    en: "Research room",
    ko: "리서치룸",
    ja: "リサーチルーム",
    "zh-TW": "研究室",
    es: "Sala de análisis",
    "pt-BR": "Sala de pesquisa",
    de: "Research-Raum",
    fr: "Salle de recherche",
  },
  briefing: {
    en: "Briefing room",
    ko: "브리핑룸",
    ja: "ブリーフィング",
    "zh-TW": "簡報室",
    es: "Sala de informes",
    "pt-BR": "Sala de briefing",
    de: "Briefing-Raum",
    fr: "Salle de briefing",
  },
};

export function SignedInSidebarNavigation({
  locale,
  collapsed,
  variant,
  activeItem,
  briefingUnread,
  onCompactNavigate,
}: NavigationProps) {
  const editorial = editorialNavigationCopy[locale];
  const items: readonly {
    id: "home" | "research-room" | "briefing-room" | "blog" | "glossary";
    href: string;
    label: string;
    icon: ReactNode;
    badge?: number;
  }[] = [
    {
      id: "home",
      href: `/?lang=${locale}#product`,
      label: uiMessage(locale, labels.dashboard),
      icon: <LayoutDashboard size={18} aria-hidden="true" />,
    },
    {
      id: "research-room",
      href: `/research-room?lang=${locale}`,
      label: uiMessage(locale, labels.research),
      icon: <LibraryBig size={18} aria-hidden="true" />,
    },
    {
      id: "briefing-room",
      href: `/briefing-room?lang=${locale}`,
      label: uiMessage(locale, labels.briefing),
      icon: <BellRing size={18} aria-hidden="true" />,
      badge: briefingUnread,
    },
    {
      id: "blog",
      href: `/${locale}/blog`,
      label: editorial.blog,
      icon: <Newspaper size={18} aria-hidden="true" />,
    },
    {
      id: "glossary",
      href: `/${locale}/glossary`,
      label: editorial.glossary,
      icon: <BookOpenText size={18} aria-hidden="true" />,
    },
  ];
  const isActive = (id: (typeof items)[number]["id"]) =>
    id === "home"
      ? activeItem === "home" || activeItem === "dashboard"
      : activeItem === id;

  if (variant === "compact")
    return (
      <nav
        className="signed-in-sidebar__compact-nav"
        aria-label={uiMessage(locale, {
          en: "Quick navigation",
          ko: "빠른 화면 이동",
          ja: "クイックナビゲーション",
          "zh-TW": "快速導覽",
          es: "Navegación rápida",
          "pt-BR": "Navegação rápida",
          de: "Schnellnavigation",
          fr: "Navigation rapide",
        })}
        aria-hidden={!collapsed}
      >
        {items.map((item) => (
          <Link
            className={isActive(item.id) ? "is-active" : undefined}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive(item.id) ? "page" : undefined}
            tabIndex={collapsed ? 0 : -1}
            title={item.label}
            onClick={onCompactNavigate}
            key={item.id}
          >
            {item.icon}
            {(item.badge ?? 0) > 0 ? (
              <span className="signed-in-sidebar__compact-badge" />
            ) : null}
          </Link>
        ))}
      </nav>
    );

  return (
    <nav
      className="signed-in-sidebar__nav"
      aria-label={uiMessage(locale, {
        en: "Workspace",
        ko: "워크스페이스",
        ja: "ワークスペース",
        "zh-TW": "工作區",
        es: "Espacio de trabajo",
        "pt-BR": "Área de trabalho",
        de: "Arbeitsbereich",
        fr: "Espace de travail",
      })}
    >
      {items.map((item) => (
        <Link
          className={isActive(item.id) ? "is-active" : undefined}
          href={item.href}
          aria-current={isActive(item.id) ? "page" : undefined}
          key={item.id}
        >
          {item.icon}
          <span>{item.label}</span>
          {(item.badge ?? 0) > 0 ? (
            <small className="signed-in-sidebar__nav-badge">
              {Math.min(99, item.badge ?? 0)}
            </small>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

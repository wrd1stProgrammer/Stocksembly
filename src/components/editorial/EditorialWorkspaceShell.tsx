"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import type { AppLocale } from "../../lib/i18n";
import type { ResearchRoomAccess } from "../../research/server/researchRoom/researchRoomCatalog";
import { Brand } from "../Brand";
import { SignedInSidebar } from "../SignedInSidebar";
import type { SignedInSidebarActiveItem } from "../SignedInSidebarNavigation";
import { SiteAtmosphere } from "../SiteAtmosphere";

type EditorialWorkspaceShellProps = Readonly<{
  access: ResearchRoomAccess;
  activeItem: Extract<SignedInSidebarActiveItem, "blog" | "glossary">;
  children: ReactNode;
  locale: AppLocale;
  localePaths: Readonly<Record<AppLocale, string>>;
}>;

export function EditorialWorkspaceShell({
  access,
  activeItem,
  children,
  locale,
  localePaths,
}: EditorialWorkspaceShellProps) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div
      className={`editorial-workspace${
        access.authenticated ? " is-authenticated" : ""
      }${collapsed ? " is-sidebar-collapsed" : ""}`}
    >
      <SiteAtmosphere />
      {access.authenticated ? (
        <SignedInSidebar
          locale={locale}
          collapsed={collapsed}
          activeItem={activeItem}
          onCollapsedChange={setCollapsed}
          onLocaleChange={(nextLocale) =>
            router.replace(localePaths[nextLocale])
          }
          onSignedOut={() => window.location.assign(localePaths[locale])}
          subscriptionTier={access.tier}
        />
      ) : null}
      <div className="editorial-workspace__content">
        {access.authenticated ? null : (
          <header className="editorial-masthead">
            <Brand locale={locale} />
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

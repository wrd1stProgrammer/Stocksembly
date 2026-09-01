"use client";

import "../../styles/research-room.css";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  BriefingEditionPayload,
  BriefingRoomState,
} from "../../briefing/domain/contracts";
import {
  type AppLocale,
  type ResearchLocale,
  researchLocale,
} from "../../lib/i18n";
import { SidebarSubscriptionModal } from "../billing/SidebarSubscriptionModal";
import { MobileBottomNav } from "../MobileBottomNav";
import { SignedInSidebar } from "../SignedInSidebar";
import { BriefingDetail } from "./BriefingDetail";
import { BriefingFeed } from "./BriefingFeed";
import { BriefingLocked, BriefingRoomHeader } from "./BriefingRoomHeader";
import { BriefingWatchlist } from "./BriefingWatchlist";
import { briefingRoomUiCopy } from "./briefingRoomUiCopy";
import { useBriefingRoomController } from "./useBriefingRoomController";

type Props = {
  readonly initialState: BriefingRoomState;
  readonly locale: AppLocale;
  readonly contentLocale?: ResearchLocale;
  readonly initialDetails?: Readonly<Record<string, BriefingEditionPayload>>;
};

export function BriefingRoom({
  initialState,
  locale,
  contentLocale = researchLocale(locale),
  initialDetails,
}: Props) {
  const router = useRouter();
  const ui = briefingRoomUiCopy[locale];
  const [collapsed, setCollapsed] = useState(true);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const controller = useBriefingRoomController({
    initialState,
    locale: contentLocale,
    initialDetails,
  });
  const { state } = controller;

  useEffect(() => {
    if (!state.authenticated) return;
    const frame = window.requestAnimationFrame(() => setCollapsed(true));
    return () => window.cancelAnimationFrame(frame);
  }, [state.authenticated]);

  return (
    <div
      className={`briefing-room${state.authenticated ? " is-authenticated" : ""}${collapsed ? " is-sidebar-collapsed" : ""}`}
    >
      {state.authenticated ? (
        <SignedInSidebar
          locale={locale}
          collapsed={collapsed}
          mobileContext={{
            eyebrow: ui.header.eyebrow,
            title: ui.header.title,
          }}
          activeItem="briefing-room"
          onCollapsedChange={setCollapsed}
          onLocaleChange={(nextLocale) =>
            router.replace(`/briefing-room?lang=${nextLocale}`)
          }
          onSignedOut={() => window.location.assign(`/?lang=${locale}`)}
          onOpenSubscription={() => setSubscriptionOpen(true)}
          subscriptionTier={state.tier === "free" ? "free" : "paid"}
        />
      ) : null}

      <MobileBottomNav
        activeItem="briefing-room"
        locale={locale}
        hidden={state.authenticated && !collapsed}
      />

      <main className="briefing-room__main">
        <BriefingRoomHeader state={state} locale={locale} />
        {!state.authenticated || !state.enabled ? (
          <BriefingLocked
            locale={locale}
            onOpenPlans={() => setSubscriptionOpen(true)}
          />
        ) : (
          <div className="briefing-room__workspace">
            <BriefingWatchlist
              locale={locale}
              items={state.watchlist}
              limit={state.watchlistLimit}
              changesRemaining={state.watchlistChangesRemaining ?? 10}
              briefingCount={state.briefings.length}
              selectedSymbol={controller.selectedSymbol}
              adding={controller.adding}
              query={controller.query}
              results={controller.results}
              busySymbol={controller.busySymbol}
              onAddingChange={controller.setAdding}
              onQueryChange={controller.setQuery}
              onSelect={controller.setSelectedSymbol}
              onAdd={(symbol) => void controller.addItem(symbol)}
              onRemove={(item) => void controller.removeItem(item)}
            />
            <BriefingFeed
              locale={locale}
              watchlistCount={state.watchlist.length}
              briefings={controller.briefings}
              onAdd={() => controller.setAdding(true)}
              onOpen={(briefing) => void controller.openBriefing(briefing)}
            />
          </div>
        )}
      </main>

      <BriefingDetail
        open={controller.detailOpen}
        briefing={controller.selected}
        locale={contentLocale}
        onClose={() => controller.setDetailOpen(false)}
      />
      <SidebarSubscriptionModal
        open={subscriptionOpen}
        locale={contentLocale}
        initialTier={
          state.authenticated
            ? state.tier === "free"
              ? "free"
              : "paid"
            : "free"
        }
        onClose={() => setSubscriptionOpen(false)}
      />
    </div>
  );
}

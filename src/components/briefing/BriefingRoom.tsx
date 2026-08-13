"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  BriefingEditionPayload,
  BriefingRoomState,
} from "../../briefing/domain/contracts";
import type { Locale } from "../../lib/i18n";
import { MobileBottomNav } from "../MobileBottomNav";
import { SignedInSidebar } from "../SignedInSidebar";
import { BriefingDetail } from "./BriefingDetail";
import { BriefingFeed } from "./BriefingFeed";
import { BriefingLocked, BriefingRoomHeader } from "./BriefingRoomHeader";
import { BriefingWatchlist } from "./BriefingWatchlist";
import { useBriefingRoomController } from "./useBriefingRoomController";

type Props = {
  readonly initialState: BriefingRoomState;
  readonly locale: Locale;
  readonly initialDetails?: Readonly<Record<string, BriefingEditionPayload>>;
};

const mobileCopy = {
  ko: { eyebrow: "미국 장 시작 1시간 전", title: "브리핑룸" },
  en: { eyebrow: "One hour before the US open", title: "Briefing room" },
} as const;

export function BriefingRoom({ initialState, locale, initialDetails }: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);
  const controller = useBriefingRoomController({
    initialState,
    locale,
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
          mobileContext={mobileCopy[locale]}
          activeItem="briefing-room"
          onCollapsedChange={setCollapsed}
          onLocaleChange={(nextLocale) =>
            router.replace(`/briefing-room?lang=${nextLocale}`)
          }
          onSignedOut={() => window.location.assign(`/?lang=${locale}`)}
          subscriptionTier={state.tier === "free" ? "free" : "paid"}
        />
      ) : null}

      <MobileBottomNav activeItem="briefing-room" locale={locale} />

      <main className="briefing-room__main">
        <BriefingRoomHeader state={state} locale={locale} />
        {!state.authenticated || !state.enabled ? (
          <BriefingLocked
            locale={locale}
            onOpenPlans={() =>
              window.location.assign(`/?lang=${locale}&billing=plans`)
            }
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
        locale={locale}
        onClose={() => controller.setDetailOpen(false)}
      />
    </div>
  );
}

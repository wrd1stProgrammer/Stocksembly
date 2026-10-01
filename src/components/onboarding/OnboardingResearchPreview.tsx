"use client";

import "../../styles/researchWorkspace";
import "../../styles/research-room.css";
import "../../styles/onboarding.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type AppLocale, researchLocale } from "../../lib/i18n";
import { fixtureData } from "../../research/compositions/fixture";
import { OFFICE_ENTRY_TIMELINE } from "../../research/officeChoreographyV7Contract";
import {
  createOfficeSimulation,
  officeSimulationSnapshot,
  stepOfficeSimulation,
} from "../../research/officeSimulation";
import type { ResearchEvent } from "../../research/types";
import { MembershipAccessModal } from "../billing/MembershipAccessModal";
import { SidebarSubscriptionModal } from "../billing/SidebarSubscriptionModal";
import { MeetingMinutes } from "../research/MeetingMinutes";
import { OfficeStage } from "../research/OfficeStage";
import { ResearchSidebar } from "../research/ResearchSidebar";
import {
  ONBOARDING_RESEARCH_KEY,
  type OnboardingResearch,
  onboardingJourneyCopy,
  onboardingResearchSchema,
} from "./onboardingJourney";

export function OnboardingResearchPreview({ locale }: { locale: AppLocale }) {
  const [draft, setDraft] = useState<OnboardingResearch>();
  const [scene, setScene] = useState(() => createOfficeSimulation());
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const frozen = scene.tick > OFFICE_ENTRY_TIMELINE.endTick;
  const copy = onboardingJourneyCopy(locale);
  const home = () => window.location.assign(`/?lang=${locale}`);
  const room = () => window.location.assign(`/research-room?lang=${locale}`);
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    try {
      const parsed = onboardingResearchSchema.safeParse(
        JSON.parse(sessionStorage.getItem(ONBOARDING_RESEARCH_KEY) ?? "null"),
      );
      if (!parsed.success) {
        window.location.replace(`/?lang=${locale}`);
        return;
      }
      setDraft(parsed.data);
    } catch {
      window.location.replace(`/?lang=${locale}`);
    }
  }, [locale]);
  useEffect(() => {
    if (!ready || frozen) return;
    const timer = window.setInterval(
      () => setScene((state) => stepOfficeSimulation(state)),
      50,
    );
    return () => window.clearInterval(timer);
  }, [ready, frozen]);
  const event = useMemo<ResearchEvent>(
    () => ({
      id: "onboarding-preview",
      phase: "briefing",
      agent: "chair",
      progress: 0,
      summary: {
        ko: "에이전트가 입장하고 있습니다.",
        en: "Your agents are entering the research room.",
      },
      detail: { ko: draft?.question ?? "", en: draft?.question ?? "" },
    }),
    [draft],
  );
  if (!draft) return null;
  const company = fixtureData.createCompany(
    draft.stock.symbol,
    draft.stock.company,
    draft.stock.exchange,
    "",
  );
  return (
    <>
      <div
        className="research-shell onboarding-preview"
        lang={locale}
        data-research-mode="official"
        data-research-state="live"
        data-sidebar-open={!collapsed}
        data-transcript-open="true"
        data-frozen={frozen}
        inert={frozen}
      >
        <div className="research-layout">
          <ResearchSidebar
            company={{ ...company, price: "—", change: "—" }}
            agents={fixtureData.agents}
            defaultAgentIds={[]}
            history={[
              {
                symbol: draft.stock.symbol,
                company: draft.stock.company,
                runs: [
                  {
                    label: draft.question,
                    date: new Date().toLocaleDateString(locale),
                    current: true,
                    live: true,
                  },
                ],
              },
            ]}
            locale={researchLocale(locale)}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            onLocaleChange={() => undefined}
            onProfileOpen={() => setPlansOpen(true)}
          />
          <OfficeStage
            current={event}
            events={[event]}
            snapshot={officeSimulationSnapshot(scene)}
            locale={researchLocale(locale)}
            uiLocale={locale}
            isPaused={frozen}
            isComplete={false}
            company={company}
            report={fixtureData.report}
            reportVersion={1}
            activeAgentIds={[]}
            onReplay={() => undefined}
            onOfficeReady={onReady}
          />
          <MeetingMinutes
            current={event}
            events={[event]}
            agents={fixtureData.agents}
            locale={researchLocale(locale)}
            uiLocale={locale}
            isComplete={false}
            reportVersion={1}
            panelOpen
            chatEnabled={false}
            questionsEnabled={false}
            loadChatHistory={false}
            pendingAgentIds={
              scene.tick >= 25
                ? fixtureData.agents
                    .filter((agent) => agent.id !== "chair")
                    .slice(0, 3)
                    .map((agent) => agent.id)
                : []
            }
          />
        </div>
      </div>
      <MembershipAccessModal
        locale={researchLocale(locale)}
        open={frozen && !plansOpen}
        reason="recent-report"
        content={{
          title: copy.gateTitle,
          description: copy.gateDescription,
          dismiss: copy.room,
        }}
        closeOnOpenPlans={false}
        onClose={room}
        onOpenPlans={() => setPlansOpen(true)}
      />
      <SidebarSubscriptionModal
        open={plansOpen}
        locale={researchLocale(locale)}
        initialTier="free"
        onClose={home}
      />
    </>
  );
}

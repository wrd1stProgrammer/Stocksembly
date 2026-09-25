"use client";

import "../../styles/researchWorkspace";
import "../../styles/research-room.css";
import { useMemo, useState } from "react";
import {
  type AppLocale,
  isLocale,
  locales,
  researchLocale,
} from "../../lib/i18n";
import { researchProgressCopy } from "../../lib/researchProgressCopy";
import { stateForRun } from "../../research/client/projection";
import type {
  PublicResearchEvent,
  PublicRunDetail,
} from "../../research/client/schemas";
import { fixtureData } from "../../research/compositions/fixture";
import { liveOfficeProjection } from "../../research/liveOfficeProjection";
import {
  createOfficeSimulation,
  officeSimulationSnapshot,
  stepOfficeSimulation,
} from "../../research/officeSimulation";
import { RESEARCH_PROGRESS_STEPS } from "../../research/researchProgress";
import { MeetingMinutes } from "./MeetingMinutes";
import { OfficeStage } from "./OfficeStage";
import { ResearchProgressTimeline } from "./ResearchProgressTimeline";
import { ResearchSidebar } from "./ResearchSidebar";

const stages = [
  "collection_started",
  "mandate_sealed",
  "department_consolidation_committed",
  "semantic_audit_committed",
  "chair_synthesis_committed",
] as const;
const states = [
  "queued",
  "running",
  "cancelling",
  "cancelled",
  "failed",
  "incomplete",
  "completed",
  "complete-with-limitations",
] as const;

// Development-only fixtures: the production timeline receives useResearchRun's
// snapshot directly. No model jobs or database writes are made by this preview.
export function ResearchProgressPreview() {
  const [locale, setLocale] = useState<AppLocale>("ko");
  const [stage, setStage] = useState(2);
  const [status, setStatus] =
    useState<PublicRunDetail["run"]["status"]>("running");
  const [reconnecting, setReconnecting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const copy = researchProgressCopy[locale];
  const snapshot: PublicRunDetail = {
    run: {
      runId: "00000000-0000-4000-8000-000000000001",
      snapshotId: "00000000-0000-4000-8000-000000000002",
      symbol: "NVDA",
      locale: "ko",
      status,
      lastEventSeq: stage + 1,
      createdAt: "2026-09-26T01:00:00.000Z",
    },
    events: stages.slice(0, stage + 1).map(
      (kind, index): PublicResearchEvent => ({
        sequence: index + 1,
        kind,
        occurredAt: "2026-09-26T01:00:00.000Z",
        stateId: kind,
        participantIds: ["market"],
        claimIds: [],
        sourceIds: [],
        limitationIds: [],
        summary: {
          en: researchProgressCopy.en[
            `${RESEARCH_PROGRESS_STEPS[index] ?? "prepare"}Detail`
          ],
          ko: researchProgressCopy.ko[
            `${RESEARCH_PROGRESS_STEPS[index] ?? "prepare"}Detail`
          ],
        },
      }),
    ),
  };
  const projection = liveOfficeProjection(snapshot);
  const scene = useMemo(() => {
    let state = createOfficeSimulation();
    for (let tick = 0; tick < 240; tick += 1)
      state = stepOfficeSimulation(state);
    return officeSimulationSnapshot(state);
  }, []);
  const company = fixtureData.createCompany(
    "NVDA",
    "NVIDIA Corporation",
    "NASDAQ",
    "Technology",
  );
  return (
    <>
      <nav
        aria-label="Local preview controls"
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          alignItems: "center",
          padding: "12px 20px",
          background: "#18181e",
          color: "#ddd",
          fontSize: 13,
        }}
      >
        <strong>LOCAL PREVIEW · SAMPLE DATA</strong>
        <label>
          Language{" "}
          <select
            aria-label="Language"
            value={locale}
            onChange={(e) => {
              if (isLocale(e.target.value)) setLocale(e.target.value);
            }}
          >
            {locales.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Stage{" "}
          <select
            aria-label="Stage"
            value={stage}
            onChange={(e) => setStage(Number(e.target.value))}
          >
            {RESEARCH_PROGRESS_STEPS.map((step, index) => (
              <option key={step} value={index}>
                {copy[step]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status{" "}
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => {
              const next = states.find((state) => state === e.target.value);
              if (next) setStatus(next);
            }}
          >
            {states.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={reconnecting}
            onChange={(e) => setReconnecting(e.target.checked)}
          />{" "}
          Connection interrupted
        </label>
      </nav>
      <div
        className="research-shell"
        lang={locale}
        data-research-mode="official"
        data-research-state="live"
        data-sidebar-open={String(sidebarOpen)}
        data-transcript-open={String(transcriptOpen)}
      >
        <div className="research-layout">
          <ResearchSidebar
            agents={fixtureData.agents}
            company={company}
            history={fixtureData.history.slice(0, 1)}
            locale={researchLocale(locale)}
            defaultAgentIds={[]}
            collapsed={!sidebarOpen}
            onLocaleChange={setLocale}
            onCollapsedChange={(collapsed) => setSidebarOpen(!collapsed)}
          />
          <OfficeStage
            current={projection.current}
            events={projection.events}
            snapshot={scene}
            locale={researchLocale(locale)}
            uiLocale={locale}
            isPaused={false}
            isComplete={false}
            company={company}
            report={fixtureData.report}
            reportVersion={1}
            activeAgentIds={["market", "market_news", "benchmark"]}
            onReplay={() => undefined}
            progressTimeline={
              <ResearchProgressTimeline
                snapshot={snapshot}
                connection={
                  reconnecting ? "connection-interrupted" : stateForRun(status)
                }
                locale={locale}
              />
            }
          />
          <MeetingMinutes
            current={projection.current}
            events={projection.events}
            agents={fixtureData.agents}
            locale={researchLocale(locale)}
            uiLocale={locale}
            isComplete={false}
            reportVersion={1}
            panelOpen={transcriptOpen}
            onPanelToggle={() => setTranscriptOpen((open) => !open)}
            chatEnabled={false}
            questionsEnabled={false}
            loadChatHistory={false}
          />
        </div>
      </div>
    </>
  );
}

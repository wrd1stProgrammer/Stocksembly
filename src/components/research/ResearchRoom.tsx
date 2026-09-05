"use client";

import "../../styles/researchWorkspace";
import "../../styles/research-room.css";
import { useEffect, useMemo, useState } from "react";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import type { Locale } from "../../lib/i18n";
import type { PublicRunDetail } from "../../research/client/schemas";
import type {
  CompositionViewData,
  ResearchCompositionPayload,
} from "../../research/compositions/types";
import { useLiveOfficeAnimation } from "../../research/liveOfficeAnimation";
import { officeTeamStatement } from "../../research/officeCommitteePresentation";
import { activeIdsForSnapshot } from "../../research/officePlaybackView";
import type { ResearchCompany } from "../../research/types";
import { useOfficePresentation } from "../../research/useOfficePresentation";
import { useIsMobileViewport } from "../useMediaQuery";
import { LiveOfficeResearchRoom } from "./LiveOfficeResearchRoom";
import { MeetingMinutes } from "./MeetingMinutes";
import { OfficeStage } from "./OfficeStage";
import { ResearchSidebar } from "./ResearchSidebar";

type FixtureProps = {
  readonly company: ResearchCompany;
  readonly payload: ResearchCompositionPayload;
  readonly initialLocale: Locale;
  readonly initialComplete?: boolean;
};

type LiveProps = {
  readonly initialLocale: Locale;
  readonly initialSnapshot: PublicRunDetail;
};

type RecoveryKind =
  | "run-required"
  | "reauthentication-required"
  | "run-unavailable"
  | "run-symbol-mismatch";

type RecoveryProps = {
  readonly initialLocale: Locale;
  readonly recovery: RecoveryKind;
};

type Props = FixtureProps | LiveProps | RecoveryProps;

type FixtureResearchBridge = {
  readonly skip: () => void;
  readonly mode: "fixture";
  readonly events: CompositionViewData["events"];
  readonly artifacts: CompositionViewData["artifacts"];
  readonly codex: ResearchCompositionPayload["codex"];
};

declare global {
  interface Window {
    __STOCKSEMBLY_RESEARCH_TEST__?: FixtureResearchBridge;
  }
}

function FixtureResearchRoom({
  company,
  payload,
  initialLocale,
  initialComplete = false,
}: FixtureProps) {
  const [locale, setLocale] = useState(initialLocale);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const reportVersion = 1;
  const { data } = payload;
  const [skipped, setSkipped] = useState(initialComplete);
  const [replayId, setReplayId] = useState(0);
  const [officeReady, setOfficeReady] = useState(false);
  const fixtureEvents = useMemo(
    () =>
      data.playbackEvents.map((event) => {
        if (event.kind === "synthesis")
          return { ...event, summary: data.report.thesis };
        const team =
          event.kind === "presentation"
            ? data.report.teamViews.find(
                (team) => team.representativeId === event.agent,
              )
            : undefined;
        return team ? { ...event, summary: officeTeamStatement(team) } : event;
      }),
    [data.playbackEvents, data.report],
  );
  const presentation = useOfficePresentation(
    fixtureEvents,
    `fixture-${replayId}`,
    skipped,
  );
  const animation = useLiveOfficeAnimation(
    presentation.tick,
    undefined,
    officeReady,
    true,
    true,
  );
  const isComplete =
    skipped || (data.events.length > 0 && presentation.drained);
  const playback = {
    current: presentation.current,
    snapshot: animation.snapshot,
    renderPreviousSnapshot: animation.previousSnapshot,
    renderInterpolationAlpha: animation.interpolation,
    activeAgentIds: activeIdsForSnapshot(animation.snapshot).active,
    isComplete,
    isPaused: false,
    publicLedger: presentation.events,
    tick: animation.snapshot.tick,
    skip: () => setSkipped(true),
    replay: () => {
      setSkipped(false);
      setReplayId((id) => id + 1);
      setOfficeReady(false);
    },
  };
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Re-evaluated on rotation and resize, not only on mount.
  const mobileViewport = useIsMobileViewport();
  useEffect(() => {
    setSidebarOpen(!mobileViewport);
  }, [mobileViewport]);

  useEffect(() => {
    if (payload.mode !== "fixture") return;
    const bridge: FixtureResearchBridge = Object.freeze({
      skip: playback.skip,
      mode: payload.mode,
      events: data.events,
      artifacts: data.artifacts,
      codex: payload.codex,
    });
    window.__STOCKSEMBLY_RESEARCH_TEST__ = bridge;
    return () => {
      if (window.__STOCKSEMBLY_RESEARCH_TEST__ === bridge) {
        delete window.__STOCKSEMBLY_RESEARCH_TEST__;
      }
    };
  }, [data.artifacts, data.events, payload, playback.skip]);

  const handleSidebarCollapsedChange = (collapsed: boolean): void => {
    const nextOpen = !collapsed;
    setSidebarOpen(nextOpen);
    if (nextOpen && mobileViewport) setTranscriptOpen(false);
  };

  const handleTranscriptToggle = (): void => {
    setTranscriptOpen((open) => {
      const nextOpen = !open;
      if (nextOpen && mobileViewport) setSidebarOpen(false);
      return nextOpen;
    });
  };

  return (
    <div
      className="research-shell"
      lang={locale}
      data-research-mode={payload.mode}
      data-research-state={playback.isComplete ? "published" : "running"}
      data-sidebar-open={sidebarOpen ? "true" : "false"}
      data-transcript-open={transcriptOpen ? "true" : "false"}
    >
      <div className="research-layout">
        <ResearchSidebar
          agents={data.agents}
          company={company}
          defaultAgentIds={data.defaultAgentIds}
          history={data.history.map((group) => ({
            ...group,
            runs: group.runs.map(({ live, ...run }) => ({
              ...run,
              ...(playback.isComplete || live === undefined ? {} : { live }),
            })),
          }))}
          locale={locale}
          compactTitle={
            playback.isComplete
              ? locale === "ko"
                ? "최종 리서치 리포트"
                : "FINAL RESEARCH REPORT"
              : locale === "ko"
                ? "실시간 리서치 룸"
                : "LIVE RESEARCH ROOM"
          }
          collapsed={!sidebarOpen}
          onCollapsedChange={handleSidebarCollapsedChange}
          onLocaleChange={setLocale}
        />
        <OfficeStage
          key={replayId}
          presentation={presentation.presentation}
          onOfficeReady={() => setOfficeReady(true)}
          current={playback.current}
          snapshot={playback.snapshot}
          renderPreviousSnapshot={playback.renderPreviousSnapshot}
          renderInterpolationAlpha={playback.renderInterpolationAlpha}
          locale={locale}
          isPaused={playback.isPaused}
          isComplete={playback.isComplete}
          company={company}
          report={data.report}
          reportVersion={reportVersion}
          activeAgentIds={playback.activeAgentIds}
          onReplay={playback.replay}
        />
        <MeetingMinutes
          key={`${reportVersion}-${playback.isComplete ? "complete" : "live"}`}
          current={playback.current}
          agents={data.agents}
          events={presentation.events}
          locale={locale}
          isComplete={playback.isComplete}
          reportVersion={reportVersion}
          questionsEnabled={false}
          panelOpen={transcriptOpen}
          onPanelToggle={handleTranscriptToggle}
        />
      </div>
      <span
        className="sr-only"
        data-testid="public-ledger"
        data-complete={playback.isComplete ? "true" : "false"}
      >
        {playback.publicLedger.length} public ledger events · tick{" "}
        {playback.tick}
      </span>
    </div>
  );
}

function RecoveryResearchRoom({ initialLocale, recovery }: RecoveryProps) {
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string>();
  const client = useMemo(() => createAuthenticatedResearchClient(), []);
  const messages =
    initialLocale === "ko"
      ? {
          "run-required": "저장된 리서치 실행 정보가 필요합니다.",
          "reauthentication-required": "로컬 리서치 세션을 새로 고쳐야 합니다.",
          "run-unavailable": "저장된 리서치 실행 정보를 불러올 수 없습니다.",
          "run-symbol-mismatch":
            "이 실행 정보는 요청한 종목에 속하지 않습니다.",
          home: "홈으로 돌아가기",
          refresh: "세션 새로 고침",
        }
      : {
          "run-required": "A persisted research run is required.",
          "reauthentication-required":
            "Your local research session needs to be refreshed.",
          "run-unavailable": "This persisted research run is unavailable.",
          "run-symbol-mismatch":
            "This run does not belong to the requested symbol.",
          home: "Return home",
          refresh: "Refresh session",
        };

  async function reauthenticate() {
    setRecoveryError(undefined);
    setIsReauthenticating(true);
    try {
      await client.bootstrapSession();
      window.location.reload();
    } catch (error) {
      if (error instanceof Error) {
        setRecoveryError(
          initialLocale === "ko"
            ? "세션을 새로 고칠 수 없습니다. 다시 시도해 주세요."
            : "Unable to refresh the local research session. Please try again.",
        );
      } else {
        throw error;
      }
    } finally {
      setIsReauthenticating(false);
    }
  }

  return (
    <div className="research-shell" lang={initialLocale}>
      <main className="office-workbench">
        <div className="office-heading">
          <span>RESEARCH RECOVERY</span>
        </div>
        <section
          className="live-research-desk"
          aria-live="polite"
          data-research-recovery={recovery}
        >
          <div className="live-research-desk__brief">
            <strong>{messages[recovery]}</strong>
          </div>
          <div className="live-research-desk__queue">
            <a href="/">{messages.home}</a>
            {recovery === "reauthentication-required" ? (
              <button
                type="button"
                disabled={isReauthenticating}
                onClick={() => void reauthenticate()}
              >
                {messages.refresh}
              </button>
            ) : null}
            {recoveryError === undefined ? null : (
              <p role="alert">{recoveryError}</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export function ResearchRoom(props: Props) {
  if ("payload" in props) return <FixtureResearchRoom {...props} />;
  if ("initialSnapshot" in props)
    return (
      <LiveOfficeResearchRoom
        key={props.initialSnapshot.run.runId}
        {...props}
      />
    );
  return <RecoveryResearchRoom {...props} />;
}

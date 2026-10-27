"use client";

import "../../styles/researchWorkspace";
import "../../styles/research-room.css";
import "../../styles/onboarding.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackOnboardingEvent } from "../../lib/analytics/client";
import { type AppLocale, researchLocale } from "../../lib/i18n";
import { useLiveOfficeAnimation } from "../../research/liveOfficeAnimation";
import { liveOfficeProjection } from "../../research/liveOfficeProjection";
import { agents } from "../../research/mockResearch";
import type { OfficeDialogueChange } from "../../research/officeDialogue";
import { MembershipAccessModal } from "../billing/MembershipAccessModal";
import { SidebarSubscriptionModal } from "../billing/SidebarSubscriptionModal";
import { MeetingMinutes } from "../research/MeetingMinutes";
import { OfficeStage } from "../research/OfficeStage";
import { ResearchProgressTimeline } from "../research/ResearchProgressTimeline";
import { ResearchSidebar } from "../research/ResearchSidebar";
import { demoCopy } from "./demoCopy";
import {
  ONBOARDING_RESEARCH_KEY,
  type OnboardingResearch,
  onboardingResearchSchema,
} from "./onboardingJourney";
import {
  demoReportFile,
  isRecentDemo,
  type ResearchDemo,
  ResearchDemoSchema,
} from "./researchDemo";

function DemoPlayback({
  demo,
  locale,
  draft,
}: {
  demo: ResearchDemo;
  locale: AppLocale;
  draft: OnboardingResearch;
}) {
  const copy = demoCopy(locale);
  const [index, setIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [rate, setRate] = useState(2);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [finished, setFinished] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [completionReason, setCompletionReason] = useState<
    "completed" | "skipped"
  >("completed");
  const started = useRef(false);
  const milestones = useRef(new Set<number>());
  const paywallVisible = useRef(false);
  const projection = useMemo(
    () => liveOfficeProjection(demo.runDetail),
    [demo],
  );
  const current = projection.events[index] ?? projection.current;
  const visible = useMemo(
    () => projection.events.slice(0, index + 1),
    [projection, index],
  );
  const animation = useLiveOfficeAnimation(
    current.tick ?? 0,
    projection.departmentReleaseOrder,
    ready && !paused && !finished,
    true,
    true,
    false,
    true,
    rate,
  );
  const onReady = useCallback(() => setReady(true), []);
  const analytics = useMemo(
    () => ({ sample_symbol: demo.symbol, locale }),
    [demo.symbol, locale],
  );
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    trackOnboardingEvent("onboarding_sample_started", analytics);
  }, [ready, analytics]);
  useEffect(() => {
    if (!ready || finished) return;
    const progress = Math.floor((index / projection.events.length) * 100);
    for (const milestone of [25, 50, 75]) {
      if (progress < milestone || milestones.current.has(milestone)) continue;
      milestones.current.add(milestone);
      trackOnboardingEvent("onboarding_sample_progress", {
        ...analytics,
        progress_percent: milestone,
      });
    }
  }, [ready, finished, index, projection.events.length, analytics]);
  useEffect(() => {
    const visible = finished && !plansOpen;
    if (visible && !paywallVisible.current) {
      trackOnboardingEvent("onboarding_paywall_viewed", {
        ...analytics,
        completion_reason: completionReason,
      });
    }
    paywallVisible.current = visible;
  }, [finished, plansOpen, completionReason, analytics]);
  const finish = useCallback(
    (reason: "completed" | "skipped") => {
      if (finished) return;
      trackOnboardingEvent(
        reason === "completed"
          ? "onboarding_sample_completed"
          : "onboarding_sample_skipped",
        {
          ...analytics,
          progress_percent:
            reason === "completed"
              ? 100
              : Math.floor((index / projection.events.length) * 100),
          playback_rate: rate,
          completion_reason: reason,
        },
      );
      setCompletionReason(reason);
      setFinished(true);
    },
    [finished, analytics, index, projection.events.length, rate],
  );
  const onChange = useCallback(
    (change: OfficeDialogueChange) => {
      if (change.id !== current.id || change.status !== "finished") return;
      if (index + 1 >= projection.events.length) finish("completed");
      else
        setIndex((previous) => (previous === index ? previous + 1 : previous));
    },
    [current.id, index, projection.events.length, finish],
  );
  const presentation = useMemo(
    () => ({
      event: current,
      active: !finished,
      preserveEntrance: true,
      playbackRate: rate,
      onChange,
    }),
    [current, finished, rate, onChange],
  );
  const report = useMemo(() => demoReportFile(demo), [demo]);
  const progressSnapshot = useMemo(
    () => ({
      ...demo.runDetail,
      run: {
        ...demo.runDetail.run,
        status: "running" as const,
        reportId: undefined,
      },
      events: demo.runDetail.events.filter(
        (event) => event.sequence <= Number(current.id.replace("durable-", "")),
      ),
    }),
    [demo, current.id],
  );
  const contentLocale = demo.sourceLocale;
  const home = () => {
    trackOnboardingEvent("onboarding_paywall_dismissed", {
      ...analytics,
      completion_reason: completionReason,
    });
    window.location.assign(`/?lang=${locale}`);
  };
  return (
    <>
      <div
        className="research-shell onboarding-preview"
        lang={locale}
        data-research-mode="official"
        data-research-state={finished ? "published" : "live"}
        data-sidebar-open={!collapsed}
        data-transcript-open={transcriptOpen}
        data-frozen={finished}
        inert={finished}
      >
        <div className="research-layout">
          <ResearchSidebar
            company={demo.company}
            agents={agents}
            defaultAgentIds={[]}
            history={[
              {
                symbol: demo.symbol,
                company: demo.company.company,
                runs: [
                  {
                    label: demo.question,
                    date: demo.publishedAt.slice(0, 10),
                    current: true,
                  },
                ],
              },
            ]}
            locale={contentLocale}
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            onLocaleChange={() => undefined}
            onProfileOpen={() => setPlansOpen(true)}
          />
          <OfficeStage
            current={current}
            events={visible}
            presentation={presentation}
            snapshot={animation.snapshot}
            renderPreviousSnapshot={animation.previousSnapshot}
            renderInterpolationAlpha={animation.interpolation}
            locale={contentLocale}
            uiLocale={locale}
            isPaused={paused || finished}
            isComplete={finished}
            company={demo.company}
            report={report}
            reportVersion={1}
            activeAgentIds={[current.agent]}
            onReplay={() => undefined}
            onOfficeReady={onReady}
            progressTimeline={
              <ResearchProgressTimeline
                snapshot={progressSnapshot}
                connection="live"
                locale={locale}
              />
            }
            headingLabel={`${copy.sample} · ${demo.publishedAt.slice(0, 10)}`}
            headingDescription={`${copy.description} ${!isRecentDemo(demo.publishedAt) || demo.symbol !== draft.stock.symbol ? copy.fallback : ""}`}
            headingActions={
              <div className="onboarding-preview__controls">
                <button
                  type="button"
                  className="meeting-minutes__cancel"
                  onClick={() => {
                    trackOnboardingEvent(
                      paused
                        ? "onboarding_sample_resumed"
                        : "onboarding_sample_paused",
                      { ...analytics, playback_rate: rate },
                    );
                    setPaused(!paused);
                  }}
                >
                  {paused ? copy.play : copy.pause}
                </button>
                <button
                  type="button"
                  className="meeting-minutes__cancel"
                  aria-label="Playback speed"
                  onClick={() => {
                    const next = rate === 1 ? 2 : rate === 2 ? 4 : 1;
                    trackOnboardingEvent("onboarding_sample_speed_changed", {
                      ...analytics,
                      playback_rate: next,
                    });
                    setRate(next);
                  }}
                >
                  {rate}×
                </button>
                <button
                  type="button"
                  className="meeting-minutes__cancel"
                  onClick={() => finish("skipped")}
                >
                  {copy.results}
                </button>
              </div>
            }
          />
          <MeetingMinutes
            current={current}
            events={visible}
            agents={agents}
            locale={contentLocale}
            uiLocale={locale}
            isComplete={false}
            reportVersion={1}
            panelOpen={transcriptOpen}
            onPanelToggle={() => setTranscriptOpen(!transcriptOpen)}
            chatEnabled={false}
            questionsEnabled={false}
            loadChatHistory={false}
            pendingAgentIds={[]}
          />
        </div>
      </div>
      <MembershipAccessModal
        locale={researchLocale(locale)}
        open={finished && !plansOpen}
        reason="recent-report"
        content={{
          title: copy.gateTitle,
          description: `${draft.stock.symbol} · ${draft.question}\n\n${copy.gateDescription}`,
          dismiss: copy.home,
          confirm: copy.confirm,
        }}
        closeOnOpenPlans={false}
        onClose={home}
        onOpenPlans={() => {
          trackOnboardingEvent("onboarding_paywall_plans_clicked", {
            ...analytics,
            completion_reason: completionReason,
          });
          setPlansOpen(true);
        }}
      />
      <SidebarSubscriptionModal
        open={plansOpen}
        locale={researchLocale(locale)}
        initialTier="free"
        localPreview={process.env.NODE_ENV === "development"}
        onClose={() => {
          trackOnboardingEvent("onboarding_plans_closed", analytics);
          setPlansOpen(false);
        }}
      />
    </>
  );
}

export function OnboardingResearchPreview({ locale }: { locale: AppLocale }) {
  const [draft, setDraft] = useState<OnboardingResearch>();
  const [demo, setDemo] = useState<ResearchDemo>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const copy = demoCopy(locale);
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
    if (!draft) return;
    const controller = new AbortController();
    setError(false);
    trackOnboardingEvent("onboarding_sample_requested", { locale, attempt });
    void fetch(
      `/api/onboarding/demo?symbol=${encodeURIComponent(draft.stock.symbol)}&attempt=${attempt}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("DEMO_UNAVAILABLE");
        const parsed = ResearchDemoSchema.parse(await response.json());
        if (!controller.signal.aborted) {
          trackOnboardingEvent("onboarding_sample_loaded", {
            locale,
            attempt,
            sample_symbol: parsed.symbol,
          });
          setDemo(parsed);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          trackOnboardingEvent("onboarding_sample_load_failed", {
            locale,
            attempt,
          });
          setError(true);
        }
      });
    return () => controller.abort();
  }, [draft, attempt, locale]);
  if (!draft || !demo)
    return (
      <main className="onboarding-demo__loading">
        <p role="status">{error ? copy.error : copy.loading}</p>
        {error && (
          <button type="button" onClick={() => setAttempt(attempt + 1)}>
            {copy.retry}
          </button>
        )}
      </main>
    );
  return <DemoPlayback demo={demo} draft={draft} locale={locale} />;
}

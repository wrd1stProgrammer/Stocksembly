"use client";

import { SidebarSimple } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import {
  type AppLocale,
  type ResearchLocale,
  researchCopy,
} from "../../lib/i18n";
import { ResearchRequestError } from "../../research/client/api";
import type {
  ActiveResearchActivity,
  ActiveResearchActivityKind,
} from "../../research/domain/activeResearchActivity";
import { activityCopy } from "../../research/researchPresentation";
import type { AgentProfile, ResearchEvent } from "../../research/types";
import { useIsMobileViewport } from "../useMediaQuery";
import { agentUiName, agentUiRole } from "./agentUiProfile";
import { researchMeetingUiCopy } from "./researchMeetingUiCopy";
import { TeamQuestionPanel } from "./TeamQuestionPanel";
import { TextShimmerWave } from "./TextShimmerWave";

type Props = {
  readonly current: ResearchEvent;
  readonly agents: readonly AgentProfile[];
  readonly events: readonly ResearchEvent[];
  readonly locale: ResearchLocale;
  readonly uiLocale?: AppLocale;
  readonly isComplete: boolean;
  readonly terminalState?: "failed" | "incomplete" | "cancelled";
  readonly reportId?: string;
  readonly reportVersion: number;
  readonly pendingAgentIds?: readonly AgentProfile["id"][];
  readonly pendingActivities?: readonly ActiveResearchActivity[];
  readonly individualizedPendingCopy?: boolean;
  readonly showLaunchStatus?: boolean;
  readonly questionsEnabled?: boolean;
  readonly chatEnabled?: boolean;
  readonly loadChatHistory?: boolean;
  readonly originalQuestion?: string;
  readonly conversation?: readonly ResearchConversationEntry[];
  readonly panelOpen?: boolean;
  readonly onPanelToggle?: () => void;
  readonly onRetry?: () => Promise<void>;
  readonly onCancel?: () => Promise<void>;
};

export type ResearchConversationEntry = {
  readonly question: string;
  readonly answer: string;
  readonly agentId: string;
  readonly createdAt: string;
};

function TypedNarrative({
  headline,
  body,
  animate,
}: {
  readonly headline: string;
  readonly body: string;
  readonly animate: boolean;
}) {
  const totalLength = headline.length + body.length;
  const [visibleCharacters, setVisibleCharacters] = useState(
    animate ? 0 : totalLength,
  );

  useEffect(() => {
    if (!animate) {
      setVisibleCharacters((current) =>
        current === totalLength ? current : totalLength,
      );
      return;
    }
    setVisibleCharacters((current) => (current === 0 ? current : 0));
    if (totalLength === 0) return;
    let cursor = 0;
    const chunk = Math.max(1, Math.ceil(totalLength / 56));
    const timer = window.setInterval(() => {
      cursor = Math.min(totalLength, cursor + chunk);
      setVisibleCharacters((current) =>
        current === cursor ? current : cursor,
      );
      if (cursor >= totalLength) window.clearInterval(timer);
    }, 26);
    return () => window.clearInterval(timer);
  }, [animate, totalLength]);

  return (
    <>
      <h3>
        {headline.slice(0, Math.min(visibleCharacters, headline.length))}
        {visibleCharacters < headline.length ? (
          <span className="meeting-minutes__cursor" aria-hidden="true" />
        ) : null}
      </h3>
      {body ? (
        <p>
          {body.slice(0, Math.max(0, visibleCharacters - headline.length))}
          {visibleCharacters >= headline.length &&
          visibleCharacters < totalLength ? (
            <span className="meeting-minutes__cursor" aria-hidden="true" />
          ) : null}
        </p>
      ) : null}
    </>
  );
}

function scrollFeedToEnd(
  feed: HTMLDivElement,
  smooth: boolean,
  mobileStack = false,
): void {
  const top = mobileStack ? 0 : feed.scrollHeight;
  if (typeof feed.scrollTo === "function") {
    feed.scrollTo({
      top,
      behavior: smooth ? "smooth" : "auto",
    });
    return;
  }
  feed.scrollTop = top;
}

type ActivityGroup =
  | "collection"
  | "individual"
  | "team"
  | "debate"
  | "audit"
  | "committee";

function activityGroup(event: ResearchEvent): ActivityGroup {
  if (event.workflowKind === undefined) {
    switch (event.phase) {
      case "briefing":
      case "collecting":
        return "collection";
      case "analyzing":
        return "individual";
      case "gathering":
        return "team";
      case "challenging":
        return "debate";
      case "auditing":
        return "audit";
      case "committee":
      case "complete":
        return "committee";
    }
  }
  switch (event.workflowKind) {
    case "run_created":
    case "collection_started":
    case "evidence_cutoff_recorded":
    case "snapshot_sealed":
    case "mandate_sealed":
      return "collection";
    case "specialist_memo_committed":
      return "individual";
    case "department_consolidation_committed":
      return "team";
    case "challenge_committed":
    case "followup_committed":
    case "owner_response_committed":
    case "department_ballot_committed":
      return "debate";
    case "structural_audit_completed":
    case "semantic_audit_committed":
      return "audit";
    default:
      return "committee";
  }
}

function groupLabel(group: ActivityGroup, locale: AppLocale): string {
  return researchMeetingUiCopy[locale].groups[group];
}

function conversationLabel(group: ActivityGroup, locale: AppLocale): string {
  if (group !== "team" && group !== "debate" && group !== "committee")
    return "";
  return researchMeetingUiCopy[locale].conversations[group];
}

function inferredActivity(
  agentId: AgentProfile["id"],
): ActiveResearchActivityKind {
  const byAgent: Partial<
    Record<AgentProfile["id"], ActiveResearchActivityKind>
  > = {
    market: "macro_analysis",
    market_news: "news_analysis",
    benchmark: "market_comparison",
    company: "business_analysis",
    company_product: "product_analysis",
    company_competition: "competition_analysis",
    financial: "financial_analysis",
    valuation: "valuation_analysis",
    financial_quality: "earnings_quality_analysis",
    risk: "downside_analysis",
    risk_policy: "policy_scenario_analysis",
    chair: "chair_synthesis",
  };
  return byAgent[agentId] ?? "data_collection";
}

function ConversationHistory({
  agents,
  conversation,
  uiLocale,
  originalQuestion,
}: {
  readonly agents: readonly AgentProfile[];
  readonly conversation: readonly ResearchConversationEntry[];
  readonly uiLocale: AppLocale;
  readonly originalQuestion?: string;
}) {
  const ui = researchMeetingUiCopy[uiLocale];
  const initial = originalQuestion?.trim();
  return (
    <section
      className="meeting-minutes__conversation-history"
      aria-label={ui.chatHistory}
    >
      {initial ? (
        <article data-role="user">
          <span>{ui.originalBrief}</span>
          <p>{initial}</p>
        </article>
      ) : null}
      {conversation.map((exchange) => {
        const agent =
          agents.find((profile) => profile.id === exchange.agentId) ??
          agents.find((profile) => profile.id === "chair");
        return (
          <div
            className="meeting-minutes__conversation-exchange"
            key={`${exchange.createdAt}-${exchange.question}`}
          >
            <article data-role="user">
              <span>{ui.followUp}</span>
              <p>{exchange.question}</p>
            </article>
            <article data-role="assistant">
              {agent === undefined ? null : (
                <Image src={agent.image} alt="" width={24} height={58} />
              )}
              <div>
                <span>
                  {agent === undefined
                    ? ui.researchChair
                    : agentUiName(agent, uiLocale)}
                </span>
                <p>{exchange.answer}</p>
              </div>
            </article>
          </div>
        );
      })}
    </section>
  );
}

export function MeetingMinutes({
  current,
  agents,
  events,
  locale,
  uiLocale = locale,
  isComplete,
  terminalState,
  reportId,
  reportVersion,
  pendingAgentIds = [],
  pendingActivities = [],
  individualizedPendingCopy = false,
  showLaunchStatus = false,
  questionsEnabled = true,
  chatEnabled = true,
  loadChatHistory = true,
  originalQuestion,
  conversation = [],
  panelOpen = true,
  onPanelToggle,
  onRetry,
  onCancel,
}: Props) {
  const ui = researchMeetingUiCopy[uiLocale];
  const [mode, setMode] = useState<"minutes" | "questions">("minutes");
  const [newEventIds, setNewEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [commandPending, setCommandPending] = useState<"retry" | "cancel">();
  const [commandError, setCommandError] = useState<
    | "retry"
    | "cancel"
    | "retry_forbidden"
    | "retry_missing"
    | "retry_unavailable"
  >();
  const canAsk =
    isComplete && chatEnabled && questionsEnabled && reportId !== undefined;
  const hasConversation =
    (originalQuestion?.trim().length ?? 0) > 0 || conversation.length > 0;
  const canChat = canAsk || hasConversation;
  const pendingWork = useMemo(() => {
    if (
      isComplete ||
      terminalState !== undefined ||
      current.workflowKind === "committee_classified" ||
      current.workflowKind === "chair_synthesis_committed" ||
      current.workflowKind === "report_published"
    )
      return [];
    const activitiesByAgent = new Map(
      pendingActivities.map((activity) => [
        activity.actorId,
        activity.activity,
      ]),
    );
    const pendingAgentIdSet = new Set(pendingAgentIds);
    return agents.flatMap((agent) => {
      const activity =
        activitiesByAgent.get(agent.id) ??
        (pendingAgentIdSet.has(agent.id)
          ? inferredActivity(agent.id)
          : undefined);
      return activity === undefined ? [] : [{ agent, activity }];
    });
  }, [
    agents,
    current.workflowKind,
    isComplete,
    pendingActivities,
    pendingAgentIds,
    terminalState,
  ]);
  const knownIds = useRef(new Set(events.map((event) => event.id)));
  const feedRef = useRef<HTMLDivElement | null>(null);
  const followTail = useRef(true);
  const mobileStackRef = useRef(false);
  const mobileStack = useIsMobileViewport();
  const displayedEvents = useMemo(
    () => (mobileStack ? [...events].reverse() : events),
    [events, mobileStack],
  );
  const mounted = useRef(false);

  useEffect(() => {
    mobileStackRef.current = mobileStack;
  }, [mobileStack]);
  useEffect(() => {
    const added = events
      .filter((event) => !knownIds.current.has(event.id))
      .map((event) => event.id);
    if (added.length === 0) return;
    for (const id of added) knownIds.current.add(id);
    setNewEventIds(new Set(added));
    if (!followTail.current) setPendingCount((count) => count + added.length);
    const timer = window.setTimeout(() => setNewEventIds(new Set()), 1_100);
    return () => window.clearTimeout(timer);
  }, [events]);

  useEffect(() => {
    if (events.length === 0) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const feed = feedRef.current;
    if (!feed || !followTail.current) return;
    scrollFeedToEnd(feed, true, mobileStackRef.current);
    setPendingCount(0);
  }, [events]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    followTail.current = true;
    setPendingCount(0);
    scrollFeedToEnd(feed, false, mobileStack);
  }, [mobileStack]);

  useEffect(() => {
    if (!canChat && mode !== "minutes") setMode("minutes");
  }, [canChat, mode]);

  function scrollToLatest() {
    const feed = feedRef.current;
    if (!feed) return;
    followTail.current = true;
    setPendingCount(0);
    scrollFeedToEnd(feed, true, mobileStackRef.current);
  }

  const pendingAgentEntries = pendingWork.map(({ agent, activity }) => (
    <div
      className="meeting-minutes__entry meeting-minutes__pending-entry"
      data-agent-thinking={agent.id}
      key={`pending-${agent.id}-${activity}`}
    >
      <article data-group={activityGroup(current)} data-pending="true">
        <Image src={agent.image} alt="" width={24} height={58} />
        <div>
          <header>
            <strong>{agentUiName(agent, uiLocale)}</strong>
            <span>{agentUiRole(agent, uiLocale)}</span>
          </header>
          <p
            className="meeting-minutes__thinking"
            role="status"
            aria-live="polite"
            aria-label={`${agentUiName(agent, uiLocale)}: ${
              individualizedPendingCopy || activity === "data_collection"
                ? researchCopy[locale].agentThinking[agent.id]
                : researchCopy[locale].activityStatus[activity]
            }`}
          >
            <span className="meeting-minutes__thinking-orb" aria-hidden="true">
              <ThinkingOrb
                state="solving"
                size={20}
                speed={0.85}
                theme="auto"
              />
            </span>
            <TextShimmerWave
              label={
                individualizedPendingCopy || activity === "data_collection"
                  ? researchCopy[locale].agentThinking[agent.id]
                  : researchCopy[locale].activityStatus[activity]
              }
            />
          </p>
        </div>
      </article>
    </div>
  ));

  return (
    <aside
      id="research-meeting-minutes"
      className="activity-panel meeting-minutes"
      data-questions-enabled={questionsEnabled ? "true" : "false"}
      data-panel-open={panelOpen ? "true" : "false"}
      aria-label={ui.minutes}
    >
      <header className="meeting-minutes__header is-complete">
        <h2 className="sr-only">{ui.minutes}</h2>
        <fieldset className="meeting-minutes__modes">
          <legend className="sr-only">{ui.rightPanelView}</legend>
          <button
            type="button"
            aria-pressed={mode === "minutes"}
            onClick={() => setMode("minutes")}
          >
            {ui.meetingLog}
          </button>
          <button
            type="button"
            aria-pressed={mode === "questions"}
            aria-disabled={!canChat}
            disabled={!canChat}
            title={canChat ? undefined : ui.chatAfterComplete}
            onClick={() => setMode("questions")}
          >
            {ui.chat}
          </button>
        </fieldset>
        <div className="meeting-minutes__controls">
          {!isComplete && terminalState === undefined && onCancel ? (
            <button
              type="button"
              className="meeting-minutes__cancel"
              disabled={commandPending !== undefined}
              onClick={() => {
                setCommandError(undefined);
                setCommandPending("cancel");
                void onCancel()
                  .catch(() => setCommandError("cancel"))
                  .finally(() => setCommandPending(undefined));
              }}
            >
              {commandPending === "cancel" ? ui.cancelling : ui.cancelResearch}
            </button>
          ) : null}
          {onPanelToggle === undefined ? null : (
            <button
              type="button"
              className="meeting-minutes__panel-toggle"
              aria-expanded={panelOpen}
              aria-controls="research-meeting-minutes-content"
              title={panelOpen ? ui.collapsePanel : ui.expandPanel}
              onClick={onPanelToggle}
            >
              <SidebarSimple
                size={20}
                weight={panelOpen ? "fill" : "regular"}
                aria-hidden="true"
              />
              <span className="sr-only">{ui.rightPanel}</span>
            </button>
          )}
        </div>
        {commandError === "cancel" ? (
          <p className="meeting-minutes__command-error" role="alert">
            {ui.cancelFailed}
          </p>
        ) : null}
      </header>
      <div
        id="research-meeting-minutes-content"
        ref={feedRef}
        className="activity-feed meeting-minutes__feed"
        data-mobile-stack={mobileStack ? "true" : "false"}
        hidden={!panelOpen || (mode === "questions" && isComplete)}
        onScroll={(event) => {
          const element = event.currentTarget;
          followTail.current = mobileStackRef.current
            ? element.scrollTop < 80
            : element.scrollHeight - element.scrollTop - element.clientHeight <
              80;
          if (followTail.current) setPendingCount(0);
        }}
      >
        {mobileStack ? pendingAgentEntries : null}
        {showLaunchStatus ? (
          <div
            className="meeting-minutes__entry meeting-minutes__launch-entry"
            data-launch-status="true"
          >
            <article data-group="collection" data-pending="true">
              <div aria-hidden="true" />
              <div>
                <header>
                  <strong>{ui.researchSetup}</strong>
                  <span>{groupLabel("collection", uiLocale)}</span>
                </header>
                <p>{ui.setupBody}</p>
              </div>
            </article>
          </div>
        ) : null}
        {displayedEvents.map((event, index) => {
          const agent = agents.find((profile) => profile.id === event.agent);
          if (!agent) return null;
          const copy = activityCopy(event.summary[locale], locale);
          const animate = newEventIds.has(event.id);
          const group = activityGroup(event);
          const participants = [
            ...new Set([event.agent, ...(event.participantIds ?? [])]),
          ]
            .map((id) => agents.find((profile) => profile.id === id))
            .filter((profile) => profile !== undefined);
          const collaborative =
            participants.length > 1 &&
            (group === "team" || group === "debate" || group === "committee");
          const previous = displayedEvents[index - 1];
          const startsGroup =
            previous === undefined || activityGroup(previous) !== group;
          return (
            <div className="meeting-minutes__entry" key={event.id}>
              {startsGroup ? (
                <div className="meeting-minutes__group" data-group={group}>
                  <span>{groupLabel(group, uiLocale)}</span>
                </div>
              ) : null}
              <article
                data-event-id={event.id}
                data-group={group}
                data-collaborative={collaborative ? "true" : undefined}
              >
                {collaborative ? (
                  <div className="meeting-minutes__avatars" aria-hidden="true">
                    {participants.slice(0, 4).map((profile) => (
                      <Image
                        key={profile.id}
                        src={profile.image}
                        alt=""
                        width={24}
                        height={58}
                      />
                    ))}
                  </div>
                ) : (
                  <Image src={agent.image} alt="" width={24} height={58} />
                )}
                <div>
                  <header>
                    <strong>
                      {(collaborative ? participants : [agent])
                        .map((profile) => agentUiName(profile, uiLocale))
                        .join(" × ")}
                    </strong>
                    <span>
                      {collaborative
                        ? conversationLabel(group, uiLocale)
                        : agentUiRole(agent, uiLocale)}
                    </span>
                  </header>
                  <TypedNarrative
                    headline={copy.headline}
                    body={copy.body}
                    animate={animate}
                  />
                </div>
              </article>
            </div>
          );
        })}
        {mobileStack ? null : pendingAgentEntries}
        {terminalState !== undefined ? (
          <section
            className="meeting-minutes__terminal"
            data-state={terminalState}
            role="status"
          >
            <span>
              {terminalState === "cancelled" ? ui.cancelled : ui.incomplete}
            </span>
            <p>{ui.terminalBody}</p>
            {terminalState !== "cancelled" && onRetry ? (
              <button
                type="button"
                disabled={commandPending !== undefined}
                onClick={() => {
                  setCommandError(undefined);
                  setCommandPending("retry");
                  void onRetry()
                    .catch((error: unknown) => {
                      if (error instanceof ResearchRequestError) {
                        setCommandError(
                          error.code === "RECOVERY_NOT_AVAILABLE"
                            ? "retry_unavailable"
                            : error.status === 404
                              ? "retry_missing"
                              : error.status === 409
                                ? "retry_forbidden"
                                : "retry",
                        );
                        return;
                      }
                      setCommandError("retry");
                    })
                    .finally(() => setCommandPending(undefined));
                }}
              >
                {commandPending === "retry" ? ui.startingRecovery : ui.resume}
              </button>
            ) : null}
            {commandError === "retry" ||
            commandError === "retry_forbidden" ||
            commandError === "retry_missing" ||
            commandError === "retry_unavailable" ? (
              <p className="meeting-minutes__command-error" role="alert">
                {commandError === "retry_unavailable"
                  ? ui.retryUnavailable
                  : commandError === "retry_forbidden"
                    ? ui.retryForbidden
                    : commandError === "retry_missing"
                      ? ui.retryMissing
                      : ui.retryFailed}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
      {pendingCount > 0 && mode === "minutes" ? (
        <button
          type="button"
          className="meeting-minutes__new"
          onClick={scrollToLatest}
        >
          {ui.newUpdates(pendingCount)}
        </button>
      ) : null}
      {canChat ? (
        <div
          className={`meeting-minutes__question-view${
            hasConversation ? " has-history" : ""
          }${canAsk ? " has-composer" : ""}`}
          hidden={!panelOpen || mode !== "questions"}
        >
          {hasConversation ? (
            <ConversationHistory
              agents={agents}
              conversation={conversation}
              uiLocale={uiLocale}
              {...(originalQuestion === undefined ? {} : { originalQuestion })}
            />
          ) : null}
          {canAsk ? (
            <TeamQuestionPanel
              agents={agents}
              researchEvents={events}
              locale={locale}
              reportId={reportId}
              reportVersion={reportVersion}
              loadHistory={loadChatHistory}
            />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

"use client";

import { SidebarSimple } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import type { Locale } from "../../lib/i18n";
import { activityCopy } from "../../research/researchPresentation";
import type { AgentProfile, ResearchEvent } from "../../research/types";
import { TeamQuestionPanel } from "./TeamQuestionPanel";
import { TextShimmerWave } from "./TextShimmerWave";

type Props = {
  readonly current: ResearchEvent;
  readonly agents: readonly AgentProfile[];
  readonly events: readonly ResearchEvent[];
  readonly locale: Locale;
  readonly isComplete: boolean;
  readonly terminalState?: "failed" | "incomplete" | "cancelled";
  readonly reportId?: string;
  readonly reportVersion: number;
  readonly pendingAgentIds?: readonly AgentProfile["id"][];
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
      setVisibleCharacters(totalLength);
      return;
    }
    setVisibleCharacters(0);
    let cursor = 0;
    const chunk = Math.max(1, Math.ceil(totalLength / 56));
    const timer = window.setInterval(() => {
      cursor = Math.min(totalLength, cursor + chunk);
      setVisibleCharacters(cursor);
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

function groupLabel(group: ActivityGroup, locale: Locale): string {
  const labels = {
    collection: { en: "Evidence setup", ko: "근거 준비" },
    individual: { en: "Independent research", ko: "개별 조사" },
    team: { en: "Team synthesis", ko: "팀 합의" },
    debate: { en: "Cross-team debate", ko: "팀 간 반론" },
    audit: { en: "Evidence audit", ko: "근거 감사" },
    committee: { en: "Final committee", ko: "최종 위원회" },
  } as const;
  return labels[group][locale];
}

function conversationLabel(group: ActivityGroup, locale: Locale): string {
  const labels = {
    team: { en: "joint synthesis", ko: "공동 정리" },
    debate: { en: "challenge and rebuttal", ko: "주장·반론" },
    committee: { en: "committee review", ko: "위원회 검토" },
  } as const;
  if (group !== "team" && group !== "debate" && group !== "committee")
    return "";
  return labels[group][locale];
}

function ConversationHistory({
  agents,
  conversation,
  locale,
  originalQuestion,
}: {
  readonly agents: readonly AgentProfile[];
  readonly conversation: readonly ResearchConversationEntry[];
  readonly locale: Locale;
  readonly originalQuestion?: string;
}) {
  const initial = originalQuestion?.trim();
  return (
    <section
      className="meeting-minutes__conversation-history"
      aria-label={locale === "ko" ? "채팅 기록" : "Chat history"}
    >
      {initial ? (
        <article data-role="user">
          <span>{locale === "ko" ? "원 질문" : "Original brief"}</span>
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
              <span>{locale === "ko" ? "후속 질문" : "Follow-up"}</span>
              <p>{exchange.question}</p>
            </article>
            <article data-role="assistant">
              {agent === undefined ? null : (
                <Image src={agent.image} alt="" width={24} height={58} />
              )}
              <div>
                <span>
                  {agent?.name[locale] ??
                    (locale === "ko" ? "리서치 의장" : "Research chair")}
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
  isComplete,
  terminalState,
  reportId,
  reportVersion,
  pendingAgentIds = [],
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
  const [mode, setMode] = useState<"minutes" | "questions">("minutes");
  const [newEventIds, setNewEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [commandPending, setCommandPending] = useState<"retry" | "cancel">();
  const [commandError, setCommandError] = useState<"retry" | "cancel">();
  const canAsk =
    isComplete && chatEnabled && questionsEnabled && reportId !== undefined;
  const hasConversation =
    (originalQuestion?.trim().length ?? 0) > 0 || conversation.length > 0;
  const canChat = canAsk || hasConversation;
  const pendingAgentIdSet = useMemo(
    () => new Set(pendingAgentIds),
    [pendingAgentIds],
  );
  const pendingAgents =
    isComplete || terminalState !== undefined
      ? []
      : agents.filter((agent) => pendingAgentIdSet.has(agent.id));
  const knownIds = useRef(new Set(events.map((event) => event.id)));
  const feedRef = useRef<HTMLDivElement | null>(null);
  const followTail = useRef(true);
  const mobileStackRef = useRef(false);
  const [mobileStack, setMobileStack] = useState(false);
  const displayedEvents = useMemo(
    () => (mobileStack ? [...events].reverse() : events),
    [events, mobileStack],
  );
  const mounted = useRef(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      mobileStackRef.current = media.matches;
      setMobileStack(media.matches);
    };
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
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

  const pendingAgentEntries = pendingAgents.map((agent) => (
    <div
      className="meeting-minutes__entry meeting-minutes__pending-entry"
      data-agent-thinking={agent.id}
      key={`pending-${agent.id}`}
    >
      <article data-group={activityGroup(current)} data-pending="true">
        <Image src={agent.image} alt="" width={24} height={58} />
        <div>
          <header>
            <strong>{agent.name[locale]}</strong>
            <span>{agent.role[locale]}</span>
          </header>
          <p
            className="meeting-minutes__thinking"
            role="status"
            aria-live="polite"
            aria-label={
              locale === "ko"
                ? `${agent.name.ko} 에이전트가 데이터와 AI 응답을 검토하고 있습니다`
                : `${agent.name.en} is reviewing data and the pending AI response`
            }
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
              label={locale === "ko" ? "분석 중..." : "Thinking..."}
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
      aria-label={locale === "ko" ? "회의록" : "Meeting minutes"}
    >
      <header className="meeting-minutes__header is-complete">
        <h2 className="sr-only">
          {locale === "ko" ? "회의록" : "Meeting minutes"}
        </h2>
        <fieldset className="meeting-minutes__modes">
          <legend className="sr-only">
            {locale === "ko" ? "우측 패널 보기" : "Right panel view"}
          </legend>
          <button
            type="button"
            aria-pressed={mode === "minutes"}
            onClick={() => setMode("minutes")}
          >
            {locale === "ko" ? "회의록" : "Meeting log"}
          </button>
          <button
            type="button"
            aria-pressed={mode === "questions"}
            aria-disabled={!canChat}
            disabled={!canChat}
            title={
              canChat
                ? undefined
                : locale === "ko"
                  ? "리서치 완료 후 이용할 수 있습니다"
                  : "Available after the research is complete"
            }
            onClick={() => setMode("questions")}
          >
            {locale === "ko" ? "채팅" : "Chat"}
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
              {commandPending === "cancel"
                ? locale === "ko"
                  ? "취소 중"
                  : "Cancelling"
                : locale === "ko"
                  ? "분석 취소"
                  : "Cancel"}
            </button>
          ) : null}
          {onPanelToggle === undefined ? null : (
            <button
              type="button"
              className="meeting-minutes__panel-toggle"
              aria-expanded={panelOpen}
              aria-controls="research-meeting-minutes-content"
              title={
                locale === "ko"
                  ? panelOpen
                    ? "우측 패널 접기"
                    : "우측 패널 펼치기"
                  : panelOpen
                    ? "Collapse right panel"
                    : "Expand right panel"
              }
              onClick={onPanelToggle}
            >
              <SidebarSimple
                size={20}
                weight={panelOpen ? "fill" : "regular"}
                aria-hidden="true"
              />
              <span className="sr-only">
                {locale === "ko" ? "우측 패널" : "Right panel"}
              </span>
            </button>
          )}
        </div>
        {commandError === "cancel" ? (
          <p className="meeting-minutes__command-error" role="alert">
            {locale === "ko"
              ? "취소 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
              : "The cancellation request could not be processed. Try again shortly."}
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
                  <span>{groupLabel(group, locale)}</span>
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
                        .map((profile) => profile.name[locale])
                        .join(" × ")}
                    </strong>
                    <span>
                      {collaborative
                        ? conversationLabel(group, locale)
                        : agent.role[locale]}
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
              {terminalState === "cancelled"
                ? locale === "ko"
                  ? "분석 취소됨"
                  : "Research cancelled"
                : locale === "ko"
                  ? "리서치를 완성하지 못했습니다"
                  : "Research could not be completed"}
            </span>
            <p>
              {locale === "ko"
                ? "완료된 단계는 보존되며 리서치 크레딧은 차감되지 않습니다. 같은 데이터 기준으로 실패한 단계부터 다시 진행할 수 있습니다."
                : "Finished stages were preserved and no research credit was charged. You can resume from the affected stage using the same evidence snapshot."}
            </p>
            {terminalState !== "cancelled" && onRetry ? (
              <button
                type="button"
                disabled={commandPending !== undefined}
                onClick={() => {
                  setCommandError(undefined);
                  setCommandPending("retry");
                  void onRetry()
                    .catch(() => setCommandError("retry"))
                    .finally(() => setCommandPending(undefined));
                }}
              >
                {commandPending === "retry"
                  ? locale === "ko"
                    ? "복구 실행 생성 중"
                    : "Preparing recovery"
                  : locale === "ko"
                    ? "실패 단계부터 다시 진행"
                    : "Resume failed stage"}
              </button>
            ) : null}
            {commandError === "retry" ? (
              <p className="meeting-minutes__command-error" role="alert">
                {locale === "ko"
                  ? "복구 실행을 시작하지 못했습니다. 크레딧과 연결 상태를 확인해 주세요."
                  : "Recovery could not start. Check your credits and connection."}
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
          {locale === "ko"
            ? `새 기록 ${pendingCount}개`
            : `${pendingCount} new update${pendingCount === 1 ? "" : "s"}`}
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
              locale={locale}
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

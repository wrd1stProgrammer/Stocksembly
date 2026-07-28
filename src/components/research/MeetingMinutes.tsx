"use client";

import { SidebarSimple } from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "../../lib/i18n";
import { activityCopy } from "../../research/researchPresentation";
import type { AgentProfile, ResearchEvent } from "../../research/types";
import { TeamQuestionPanel } from "./TeamQuestionPanel";

type Props = {
  readonly current: ResearchEvent;
  readonly agents: readonly AgentProfile[];
  readonly events: readonly ResearchEvent[];
  readonly locale: Locale;
  readonly isComplete: boolean;
  readonly terminalState?: "failed" | "incomplete" | "cancelled";
  readonly reportId?: string;
  readonly reportVersion: number;
  readonly questionsEnabled?: boolean;
  readonly panelOpen?: boolean;
  readonly onPanelToggle?: () => void;
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

function scrollFeedToEnd(feed: HTMLDivElement, smooth: boolean): void {
  if (typeof feed.scrollTo === "function") {
    feed.scrollTo({
      top: feed.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    return;
  }
  feed.scrollTop = feed.scrollHeight;
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

function liveStatus(event: ResearchEvent, locale: Locale): string {
  const waiting = {
    structural_audit_completed: {
      en: "Checking claim-to-evidence meaning",
      ko: "주장과 근거의 의미 일치 검증 중",
    },
    semantic_audit_committed: {
      en: "Preparing the final committee agenda",
      ko: "최종 위원회 안건 구성 중",
    },
    gathering_started: {
      en: "Reconciling team votes and dissent",
      ko: "팀별 투표와 이견 조정 중",
    },
    committee_classified: {
      en: "Research chair is writing the conclusion",
      ko: "리서치 의장이 최종 결론 작성 중",
    },
    chair_synthesis_committed: {
      en: "Publishing the report and PDF",
      ko: "최종 보고서와 PDF 발행 중",
    },
  } as const;
  const status =
    event.workflowKind === undefined
      ? undefined
      : waiting[event.workflowKind as keyof typeof waiting];
  if (status !== undefined) return status[locale];
  return event.phase === "challenging" || event.phase === "committee"
    ? locale === "ko"
      ? "강세·약세 논쟁 진행 중"
      : "Bull and bear debate in progress"
    : locale === "ko"
      ? "부서별 조사 진행 중"
      : "Department research in progress";
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
  questionsEnabled = true,
  panelOpen = true,
  onPanelToggle,
}: Props) {
  const [mode, setMode] = useState<"minutes" | "questions">("minutes");
  const [newEventIds, setNewEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pendingCount, setPendingCount] = useState(0);
  const canChat = isComplete && questionsEnabled && reportId !== undefined;
  const knownIds = useRef(new Set(events.map((event) => event.id)));
  const feedRef = useRef<HTMLDivElement | null>(null);
  const followTail = useRef(true);
  const mounted = useRef(false);
  const terminalLabel =
    terminalState === "failed"
      ? locale === "ko"
        ? "리서치 실패"
        : "Research failed"
      : terminalState === "incomplete"
        ? locale === "ko"
          ? "리서치 미완료"
          : "Research incomplete"
        : terminalState === "cancelled"
          ? locale === "ko"
            ? "리서치 취소됨"
            : "Research cancelled"
          : undefined;

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
    scrollFeedToEnd(feed, true);
    setPendingCount(0);
  }, [events]);

  function scrollToLatest() {
    const feed = feedRef.current;
    if (!feed) return;
    followTail.current = true;
    setPendingCount(0);
    scrollFeedToEnd(feed, true);
  }

  return (
    <aside
      id="research-meeting-minutes"
      className="activity-panel meeting-minutes"
      data-questions-enabled={questionsEnabled ? "true" : "false"}
      data-panel-open={panelOpen ? "true" : "false"}
      aria-label={locale === "ko" ? "회의록" : "Meeting minutes"}
    >
      <header
        className={`meeting-minutes__header${isComplete ? " is-complete" : ""}`}
      >
        <h2 className={isComplete ? "sr-only" : undefined}>
          {locale === "ko" ? "회의록" : "Meeting minutes"}
        </h2>
        {canChat ? (
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
              onClick={() => setMode("questions")}
            >
              {locale === "ko" ? "채팅" : "Chat"}
            </button>
          </fieldset>
        ) : null}
        {isComplete ? (
          <div className="meeting-minutes__controls">
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
        ) : (
          <span>
            <i />
            {terminalLabel ?? liveStatus(current, locale)}
          </span>
        )}
      </header>
      <div
        id="research-meeting-minutes-content"
        ref={feedRef}
        className="activity-feed meeting-minutes__feed"
        hidden={!panelOpen || (mode === "questions" && isComplete)}
        onScroll={(event) => {
          const element = event.currentTarget;
          followTail.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            80;
          if (followTail.current) setPendingCount(0);
        }}
      >
        {events.map((event, index) => {
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
          const previous = events[index - 1];
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
          className="meeting-minutes__question-view"
          hidden={!panelOpen || mode !== "questions"}
        >
          <TeamQuestionPanel
            agents={agents}
            locale={locale}
            reportId={reportId}
            reportVersion={reportVersion}
          />
        </div>
      ) : null}
    </aside>
  );
}

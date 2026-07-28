import {
  ChatCircleDots,
  FileText,
  LinkSimple,
  ListBullets,
} from "@phosphor-icons/react";
import Image from "next/image";
import type { Locale } from "../../lib/i18n";
import type {
  AgentId,
  AgentProfile,
  PanelTab,
  ResearchEvent,
} from "../../research/types";

type Props = {
  readonly agents: readonly AgentProfile[];
  readonly current: ResearchEvent;
  readonly events: readonly ResearchEvent[];
  readonly locale: Locale;
  readonly tab: PanelTab;
  readonly activeAgentIds: readonly AgentId[];
  readonly onTabChange: (tab: PanelTab) => void;
};

const tabs: readonly {
  readonly id: PanelTab;
  readonly icon: typeof ListBullets;
  readonly en: string;
  readonly ko: string;
}[] = [
  { id: "activity", icon: ListBullets, en: "Activity", ko: "활동" },
  { id: "debate", icon: ChatCircleDots, en: "Debate", ko: "토론" },
  { id: "sources", icon: FileText, en: "Sources", ko: "출처" },
];

const koreanSourceLabels: Readonly<Record<string, string>> = {
  "Reuters · filings": "Reuters · 공시",
  "SEC filings · macro data": "SEC 공시 · 거시 데이터",
  "Company filings · earnings call": "기업 공시 · 실적 발표",
  "Reuters · market data": "Reuters · 시장 데이터",
  "10-K · product filings": "10-K · 제품 공시",
  "10-Q · XBRL": "10-Q · XBRL",
  "BIS · filings": "BIS · 공시",
  "Linked public evidence": "연결된 공개 근거",
  "Counter-evidence ledger": "반대 근거 원장",
  "Public evidence ledger": "공개 근거 원장",
  "Reuters · 10-K": "Reuters · 10-K",
  "Company filings": "기업 공시",
  "10-Q · Earnings call": "10-Q · 실적 발표",
  "SEC XBRL · Nasdaq": "SEC XBRL · Nasdaq",
  "BIS · Company filings": "BIS · 기업 공시",
};

function sourceLabel(source: string, locale: Locale): string {
  return locale === "ko" ? (koreanSourceLabels[source] ?? source) : source;
}

function eventState(event: ResearchEvent, locale: Locale): string {
  const key = event.source
    ? "source"
    : event.kind === "complete"
      ? "complete"
      : event.kind === "presentation" || event.kind === "synthesis"
        ? "review"
        : event.kind === "summary" || event.kind === "handoff"
          ? "published"
          : "assigned";
  return locale === "ko"
    ? {
        assigned: "배정됨",
        source: "출처 연결",
        review: "검토 중",
        published: "공개됨",
        complete: "감사 완료",
      }[key]
    : {
        assigned: "Assigned",
        source: "Source linked",
        review: "In review",
        published: "Published",
        complete: "Audit complete",
      }[key];
}

export function ActivityPanel({
  agents,
  current,
  events,
  locale,
  tab,
  activeAgentIds,
  onTabChange,
}: Props) {
  const activeAgents = new Set(activeAgentIds);
  const sourceEvents = events.filter((event) => event.source);
  const debateEvents = events.filter(
    (event) =>
      event.kind === "handoff" ||
      event.kind === "presentation" ||
      event.kind === "synthesis" ||
      event.kind === "complete" ||
      event.phase === "challenging" ||
      event.phase === "committee" ||
      event.phase === "complete",
  );
  const displayed =
    tab === "sources" ? sourceEvents : tab === "debate" ? debateEvents : events;

  return (
    <aside className="activity-panel">
      <div
        className="activity-tabs"
        role="tablist"
        aria-label={locale === "ko" ? "리서치 상세" : "Research details"}
      >
        {tabs.map(({ id, icon: Icon, en, ko }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTabChange(id)}
          >
            <Icon size={17} />
            <span>{locale === "ko" ? ko : en}</span>
          </button>
        ))}
      </div>
      <div className="activity-panel__live">
        <i />
        {locale === "ko" ? "실시간 공개 원장" : "LIVE PUBLIC LEDGER"}
        <span>{events.length}</span>
      </div>
      <div className="activity-feed" role="tabpanel">
        {displayed.length === 0 ? (
          <div className="activity-empty">
            <ChatCircleDots size={28} />
            <p>
              {locale === "ko"
                ? "위원회 토론이 시작되면 여기에 표시됩니다."
                : "Committee debate will appear here."}
            </p>
          </div>
        ) : null}
        {displayed.map((event) => {
          const agent = agents.find((profile) => profile.id === event.agent);
          if (!agent) return null;
          return (
            <article
              key={event.id}
              data-event-id={event.id}
              data-event-kind={event.kind}
              className={
                current.id === event.id || activeAgents.has(event.agent)
                  ? "is-current"
                  : ""
              }
            >
              <Image src={agent.image} alt="" width={21} height={52} />
              <div>
                <header>
                  <strong>{agent.name[locale]}</strong>
                  <span>{agent.role[locale]}</span>
                  <em>{eventState(event, locale)}</em>
                </header>
                <h2>{event.summary[locale]}</h2>
                <p>{event.detail[locale]}</p>
                {event.participantIds && event.participantIds.length > 1 ? (
                  <small className="activity-participants">
                    {event.participantIds.map((participantId, index) => (
                      <span key={participantId}>
                        {index > 0 ? (
                          <span
                            className="activity-participants__separator"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                        ) : null}
                        <span className="activity-participants__name">
                          {agents.find(
                            (profile) => profile.id === participantId,
                          )?.name[locale] ?? participantId}
                        </span>
                      </span>
                    ))}
                  </small>
                ) : null}
                {event.source ? (
                  <a href="#evidence">
                    <LinkSimple size={14} />
                    {sourceLabel(event.source, locale)}
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

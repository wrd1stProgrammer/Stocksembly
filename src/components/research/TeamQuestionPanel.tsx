"use client";

import { ArrowUp, CaretDown, Check, X } from "@phosphor-icons/react";
import { BorderBeam } from "border-beam";
import Image from "next/image";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "../../lib/i18n";
import type { ResearchClient } from "../../research/client/api";
import {
  activityCopy,
  compactNarrative,
} from "../../research/researchPresentation";
import type { AgentProfile, ResearchEvent } from "../../research/types";
import { CreditShortageModal } from "../billing/CreditShortageModal";
import { LiveCaretInput } from "../live-caret-input";
import { ConsultationAnswerMessage } from "./ConsultationAnswerMessage";
import { useAgentConsultation } from "./useAgentConsultation";

type Props = {
  readonly agents: readonly AgentProfile[];
  readonly loadHistory?: boolean;
  readonly researchEvents?: readonly ResearchEvent[];
  readonly locale: Locale;
  readonly reportId: string;
  readonly reportVersion: number;
  readonly questionClient?: Pick<ResearchClient, "askQuestion" | "getQuestion">;
};

const starterQuestions = {
  en: [
    "What is the strongest counterargument to this conclusion?",
    "Which assumption is most likely to fail?",
    "What would make the team change its judgment?",
  ],
  ko: [
    "이 결론에 대한 가장 강한 반론은 무엇인가요?",
    "가장 무너지기 쉬운 가정은 무엇인가요?",
    "어떤 조건에서 팀의 판단이 바뀌나요?",
  ],
} as const;

type AgentResearchView = {
  readonly insight: string;
  readonly issue: string;
  readonly evidence: readonly string[];
};

const departmentOrder = [
  "market",
  "company",
  "financial",
  "risk",
  "chair",
] as const;

const departmentLabels = {
  market: { en: "Market", ko: "시장 분석" },
  company: { en: "Company", ko: "기업 분석" },
  financial: { en: "Financial", ko: "재무 분석" },
  risk: { en: "Risk", ko: "리스크 분석" },
  chair: { en: "Committee", ko: "최종 위원회" },
} as const;

const researchViewKinds = new Set([
  "specialist_memo_committed",
  "department_consolidation_committed",
  "challenge_committed",
  "followup_committed",
  "owner_response_committed",
  "department_ballot_committed",
  "semantic_audit_committed",
  "committee_classified",
  "chair_synthesis_committed",
]);

function lastMatching(
  events: readonly ResearchEvent[],
  predicate: (event: ResearchEvent) => boolean,
): ResearchEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event !== undefined && predicate(event)) return event;
  }
  return undefined;
}

function eventCopy(event: ResearchEvent, locale: Locale): string {
  const summary = activityCopy(event.summary[locale], locale);
  return compactNarrative(
    [summary.headline, summary.body].filter(Boolean).join(" "),
    {
      sentences: 3,
      characters: 420,
    },
  );
}

function agentResearchView(
  agent: AgentProfile,
  events: readonly ResearchEvent[],
  locale: Locale,
): AgentResearchView {
  const owned = events.filter((event) => event.agent === agent.id);
  const relevant = events.filter(
    (event) =>
      event.agent === agent.id ||
      event.participantIds?.includes(agent.id) === true,
  );
  const priority =
    agent.id === "chair"
      ? [
          "chair_synthesis_committed",
          "committee_classified",
          "semantic_audit_committed",
        ]
      : [
          "specialist_memo_committed",
          "owner_response_committed",
          "department_consolidation_committed",
          "department_ballot_committed",
        ];
  const insightEvent =
    priority
      .map((kind) =>
        lastMatching(owned, (event) => event.workflowKind === kind),
      )
      .find((event) => event !== undefined) ?? owned.at(-1);
  const issueEvent = lastMatching(
    relevant,
    (event) =>
      event.id !== insightEvent?.id &&
      (event.workflowKind === "challenge_committed" ||
        event.workflowKind === "followup_committed" ||
        event.workflowKind === "owner_response_committed" ||
        event.workflowKind === "department_consolidation_committed" ||
        event.workflowKind === "department_ballot_committed" ||
        event.workflowKind === "committee_classified" ||
        event.workflowKind === "semantic_audit_committed"),
  );
  const insight =
    insightEvent === undefined
      ? agent.specialty[locale]
      : eventCopy(insightEvent, locale);
  const issue =
    issueEvent === undefined
      ? locale === "ko"
        ? `${agent.specialty.ko} 관점에서 판단을 바꿀 반대 근거와 전제 변화를 확인합니다.`
        : `Tests the contrary evidence and assumption changes that could alter the ${agent.specialty.en.toLowerCase()} view.`
      : eventCopy(issueEvent, locale);
  const evidence = [
    ...new Set(
      relevant
        .filter(
          (event) =>
            event.id !== insightEvent?.id &&
            event.id !== issueEvent?.id &&
            researchViewKinds.has(event.workflowKind ?? ""),
        )
        .map((event) => eventCopy(event, locale))
        .filter((copy) => copy !== insight && copy !== issue),
    ),
  ].slice(-3);

  return {
    insight,
    issue,
    evidence,
  };
}

function AgentSelectionModal({
  agents,
  locale,
  events,
  selectedAgentId,
  onClose,
  onSelect,
}: {
  readonly agents: readonly AgentProfile[];
  readonly locale: Locale;
  readonly events: readonly ResearchEvent[];
  readonly selectedAgentId: AgentProfile["id"];
  readonly onClose: () => void;
  readonly onSelect: (agent: AgentProfile) => void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [previewAgentId, setPreviewAgentId] = useState(selectedAgentId);
  const previewAgent =
    agents.find((agent) => agent.id === previewAgentId) ??
    agents.at(0) ??
    agents[0];

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (previewAgent === undefined) return null;
  const previewView = agentResearchView(previewAgent, events, locale);
  if (!mounted) return null;

  return createPortal(
    <div className="agent-selection-modal">
      <section
        className="agent-selection-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="agent-selection-modal__header">
          <div>
            <span>
              {locale === "ko" ? "전문 리서치 상담" : "Research consultation"}
            </span>
            <h2 id={titleId}>
              {locale === "ko"
                ? "누구의 관점으로 답변할까요?"
                : "Choose a specialist perspective"}
            </h2>
            <p>
              {locale === "ko"
                ? "이번 리서치에서 실제로 정리한 판단과 쟁점을 비교해 선택하세요."
                : "Compare each agent’s actual conclusion and debate point from this research."}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={locale === "ko" ? "닫기" : "Close"}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="agent-selection-modal__body">
          <nav
            className="agent-selection-modal__roster"
            aria-label={locale === "ko" ? "에이전트 목록" : "Agent roster"}
          >
            {departmentOrder.map((departmentId) => {
              const members = agents.filter(
                (agent) => agent.departmentId === departmentId,
              );
              if (members.length === 0) return null;
              return (
                <section key={departmentId}>
                  <h3>{departmentLabels[departmentId][locale]}</h3>
                  {members.map((agent) => {
                    const view = agentResearchView(agent, events, locale);
                    const previewed = agent.id === previewAgent.id;
                    const selected = agent.id === selectedAgentId;
                    return (
                      <button
                        type="button"
                        data-active={previewed ? "true" : undefined}
                        key={agent.id}
                        onMouseEnter={() => setPreviewAgentId(agent.id)}
                        onFocus={() => setPreviewAgentId(agent.id)}
                        onClick={() => onSelect(agent)}
                        aria-label={
                          locale === "ko"
                            ? `${agent.name[locale]} 선택`
                            : `Select ${agent.name[locale]}`
                        }
                      >
                        <span className="agent-selection-modal__roster-avatar">
                          <Image
                            src={agent.image}
                            alt=""
                            width={72}
                            height={72}
                          />
                        </span>
                        <span>
                          <strong>{agent.name[locale]}</strong>
                          <small>{agent.role[locale]}</small>
                          <em>{view.insight}</em>
                        </span>
                        {selected ? (
                          <Check size={14} weight="bold" aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                </section>
              );
            })}
          </nav>

          <article className="agent-selection-modal__detail">
            <header>
              <span className="agent-selection-modal__hero-portrait">
                <Image
                  src={previewAgent.image}
                  alt=""
                  width={180}
                  height={180}
                />
              </span>
              <div>
                <small>
                  {departmentLabels[previewAgent.departmentId][locale]}
                </small>
                <h3>{previewAgent.name[locale]}</h3>
                <strong>{previewAgent.role[locale]}</strong>
                <p>{previewAgent.specialty[locale]}</p>
              </div>
            </header>

            <section className="agent-selection-modal__judgment">
              <small>{locale === "ko" ? "판단 요약" : "Research view"}</small>
              <p>{previewView.insight}</p>
            </section>

            <div className="agent-selection-modal__detail-grid">
              <section>
                <small>
                  {previewView.evidence.length > 0
                    ? locale === "ko"
                      ? "검토 근거"
                      : "Evidence reviewed"
                    : locale === "ko"
                      ? "전문 검토 범위"
                      : "Specialist scope"}
                </small>
                {previewView.evidence.length > 0 ? (
                  <ol>
                    {previewView.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  <p>{previewAgent.specialty[locale]}</p>
                )}
              </section>
              <section>
                <small>{locale === "ko" ? "핵심 쟁점" : "Key issue"}</small>
                <p>{previewView.issue}</p>
              </section>
            </div>
          </article>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function TeamQuestionPanel({
  agents,
  loadHistory = true,
  researchEvents = [],
  locale,
  reportId,
  questionClient,
}: Props) {
  const defaultAgentId =
    agents.find((agent) => agent.id === "chair")?.id ??
    agents.at(0)?.id ??
    "chair";
  const [agentId, setAgentId] = useState<AgentProfile["id"]>(defaultAgentId);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [advancedReasoning, setAdvancedReasoning] = useState(false);
  const {
    ask,
    creditShortageOpen,
    dismissCreditShortage,
    isSubmitting,
    messages,
  } = useAgentConsultation({
    ...(questionClient === undefined ? {} : { client: questionClient }),
    locale,
    reportId,
    loadHistory,
  });
  const selectedAgent =
    agents.find((agent) => agent.id === agentId) ?? agents.at(0);
  if (selectedAgent === undefined) return null;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isSubmitting) return;
    void ask({
      agent: selectedAgent,
      advancedReasoning,
      question: trimmed,
    });
    setQuestion("");
  };

  return (
    <>
      <section
        className="team-question-panel"
        aria-label={
          locale === "ko" ? "리서치 전문 상담" : "Research consultation"
        }
      >
        <div className="team-question-panel__messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="team-question-panel__empty">
              <Image src={selectedAgent.image} alt="" width={42} height={101} />
              <div>
                <strong>{selectedAgent.name[locale]}</strong>
              </div>
              <div className="team-question-panel__starters">
                {starterQuestions[locale].map((starter) => (
                  <button
                    type="button"
                    key={starter}
                    onClick={() => setQuestion(starter)}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const agent =
                agents.find((profile) => profile.id === message.agentId) ??
                selectedAgent;
              return message.kind === "question" ? (
                <article
                  className="team-question-panel__question"
                  key={message.id}
                >
                  <p>{message.text}</p>
                </article>
              ) : (
                <ConsultationAnswerMessage
                  key={message.id}
                  agent={agent}
                  locale={locale}
                  message={message}
                />
              );
            })
          )}
        </div>

        <BorderBeam
          className="team-question-panel__beam"
          size="md"
          colorVariant="mono"
          strength={0.99}
        >
          <form className="team-question-panel__composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="team-question-input">
              {locale === "ko" ? "질문" : "Question"}
            </label>
            <LiveCaretInput
              className="team-question-panel__composer-input"
              fieldClassName="team-question-panel__composer-mirror"
              multiline
              id="team-question-input"
              value={question}
              maxLength={1_200}
              rows={2}
              onChange={setQuestion}
              placeholder={
                locale === "ko"
                  ? `${selectedAgent.name[locale]}에게 질문...`
                  : `Ask ${selectedAgent.name[locale]}...`
              }
              cursorVariant="line"
              charAnimation="spring"
              color="var(--research-accent-bright)"
            />
            <div className="team-question-panel__composer-tools">
              <button
                type="button"
                className="team-question-panel__agent-select"
                aria-haspopup="dialog"
                aria-expanded={agentModalOpen}
                onClick={() => setAgentModalOpen(true)}
              >
                <Image
                  src={selectedAgent.image}
                  alt=""
                  width={22}
                  height={32}
                />
                <span>{selectedAgent.name[locale]}</span>
                <CaretDown size={13} aria-hidden="true" />
                <span className="sr-only">
                  {locale === "ko" ? "에이전트 선택" : "Choose agent"}
                </span>
              </button>
              <label className="team-question-panel__easy">
                <input
                  type="checkbox"
                  checked={advancedReasoning}
                  onChange={(event) =>
                    setAdvancedReasoning(event.target.checked)
                  }
                />
                <span aria-hidden="true" />
                {locale === "ko" ? "고급추론" : "Advanced reasoning"}
              </label>
              <button
                type="submit"
                disabled={!question.trim() || isSubmitting}
                aria-label={locale === "ko" ? "질문 보내기" : "Send question"}
              >
                <ArrowUp size={19} />
              </button>
            </div>
          </form>
        </BorderBeam>
        {agentModalOpen ? (
          <AgentSelectionModal
            agents={agents}
            events={researchEvents}
            locale={locale}
            selectedAgentId={selectedAgent.id}
            onClose={() => setAgentModalOpen(false)}
            onSelect={(agent) => {
              setAgentId(agent.id);
              setAgentModalOpen(false);
            }}
          />
        ) : null}
      </section>
      <CreditShortageModal
        locale={locale}
        open={creditShortageOpen}
        onClose={dismissCreditShortage}
      />
    </>
  );
}

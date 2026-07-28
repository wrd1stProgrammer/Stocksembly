"use client";

import { ArrowUp, CaretDown } from "@phosphor-icons/react";
import { BorderBeam } from "border-beam";
import Image from "next/image";
import { type FormEvent, useState } from "react";
import type { Locale } from "../../lib/i18n";
import type { ResearchClient } from "../../research/client/api";
import type { AgentProfile } from "../../research/types";
import { ConsultationAnswerMessage } from "./ConsultationAnswerMessage";
import { useAgentConsultation } from "./useAgentConsultation";

type Props = {
  readonly agents: readonly AgentProfile[];
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

export function TeamQuestionPanel({
  agents,
  locale,
  reportId,
  questionClient,
}: Props) {
  const defaultAgentId =
    agents.find((agent) => agent.id === "chair")?.id ??
    agents.at(0)?.id ??
    "chair";
  const [agentId, setAgentId] = useState<AgentProfile["id"]>(defaultAgentId);
  const [question, setQuestion] = useState("");
  const [advancedReasoning, setAdvancedReasoning] = useState(false);
  const { ask, isSubmitting, messages } = useAgentConsultation({
    ...(questionClient === undefined ? {} : { client: questionClient }),
    locale,
    reportId,
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
          <textarea
            id="team-question-input"
            value={question}
            maxLength={1_200}
            rows={2}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={
              locale === "ko"
                ? `${selectedAgent.name[locale]}에게 질문...`
                : `Ask ${selectedAgent.name[locale]}...`
            }
          />
          <div className="team-question-panel__composer-tools">
            <label className="team-question-panel__agent-select">
              <span className="sr-only">
                {locale === "ko" ? "전문가" : "Specialist"}
              </span>
              <i aria-hidden="true" />
              <select
                value={agentId}
                onChange={(event) => {
                  const nextAgent = agents.find(
                    (agent) => agent.id === event.target.value,
                  );
                  if (nextAgent !== undefined) setAgentId(nextAgent.id);
                }}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name[locale]}
                  </option>
                ))}
              </select>
              <CaretDown size={13} aria-hidden="true" />
            </label>
            <label className="team-question-panel__easy">
              <input
                type="checkbox"
                checked={advancedReasoning}
                onChange={(event) => setAdvancedReasoning(event.target.checked)}
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
    </section>
  );
}

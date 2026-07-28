"use client";

import Image from "next/image";
import { ThinkingOrb } from "thinking-orbs";
import type { Locale } from "../../lib/i18n";
import type { AgentProfile } from "../../research/types";
import { TextShimmerWave } from "./TextShimmerWave";
import { TypewriterText } from "./TypewriterText";
import type { ConsultationMessage } from "./useAgentConsultation";

type Props = {
  readonly agent: AgentProfile;
  readonly locale: Locale;
  readonly message: Extract<ConsultationMessage, { readonly kind: "answer" }>;
};

function consultationError(code: string | undefined, locale: Locale): string {
  if (code === "QUESTION_ACTIVE")
    return locale === "ko"
      ? "이전 답변을 마친 뒤 다시 질문해 주세요."
      : "Please wait for the previous answer to finish.";
  if (code === "QUESTION_QUOTA_EXHAUSTED")
    return locale === "ko"
      ? "이 리포트에서 사용할 수 있는 상담 횟수를 모두 사용했습니다."
      : "This Research File has reached its consultation limit.";
  return locale === "ko"
    ? "답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    : "The answer could not be loaded. Please try again shortly.";
}

export function ConsultationAnswerMessage({ agent, locale, message }: Props) {
  return (
    <article className="team-question-panel__answer" data-state={message.state}>
      <header>
        <Image src={agent.image} alt="" width={28} height={68} />
        <span>
          <strong>{agent.name[locale]}</strong>
        </span>
      </header>
      {message.state === "pending" ? (
        <p
          className="team-question-panel__pending"
          role="status"
          data-activity={message.activity}
          aria-label={
            message.activity === "searching"
              ? locale === "ko"
                ? "외부 근거 검색 중"
                : "Searching external evidence"
              : locale === "ko"
                ? "답변 작성 중"
                : "Composing answer"
          }
        >
          <span className="team-question-panel__status-orb" aria-hidden="true">
            <ThinkingOrb
              state={message.activity === "searching" ? "searching" : "solving"}
              size={20}
            />
          </span>
          <TextShimmerWave
            label={
              message.activity === "searching" ? "Searching..." : "Thinking..."
            }
          />
        </p>
      ) : message.state === "failed" ? (
        <p role="alert">{consultationError(message.errorCode, locale)}</p>
      ) : (
        <>
          {message.paragraphs.map((paragraph) => (
            <TypewriterText key={paragraph} text={paragraph} />
          ))}
          {message.evidence.length === 0 ? null : (
            <details className="team-question-panel__evidence">
              <summary>
                {locale === "ko"
                  ? "이 답변에 사용한 근거"
                  : "Evidence used in this answer"}
              </summary>
              <ol>
                {message.evidence.map((evidence) => (
                  <li key={`${evidence.url ?? "report"}:${evidence.label}`}>
                    {evidence.url === undefined ? (
                      evidence.label
                    ) : (
                      <a href={evidence.url} target="_blank" rel="noreferrer">
                        {evidence.label}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </article>
  );
}

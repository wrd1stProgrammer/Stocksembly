"use client";

import { useEffect, useRef, useState } from "react";
import { createAuthenticatedResearchClient } from "../../auth/researchClient";
import type { Locale } from "../../lib/i18n";
import {
  type ResearchClient,
  ResearchRequestError,
} from "../../research/client/api";
import type { PublicQuestion } from "../../research/client/schemas";
import { questionLookupPlan } from "../../research/domain/questionLookupPlan";
import type { AgentProfile } from "../../research/types";
import {
  type ConsultationMessage,
  consultationPayload,
  loadConsultationMessages,
  saveConsultationMessages,
} from "./agentConsultationMemory";

export type { ConsultationMessage } from "./agentConsultationMemory";

type QuestionClient = Pick<ResearchClient, "askQuestion" | "getQuestion">;

type Options = {
  readonly client?: QuestionClient;
  readonly locale: Locale;
  readonly reportId: string;
};

type AskInput = {
  readonly advancedReasoning: boolean;
  readonly agent: AgentProfile;
  readonly question: string;
};

function failureCode(error: unknown): string {
  if (error instanceof ResearchRequestError) return error.code;
  return "CONSULTATION_UNAVAILABLE";
}

async function waitForAnswer(
  client: QuestionClient,
  initial: PublicQuestion,
  onProgress: (question: PublicQuestion) => void,
): Promise<PublicQuestion> {
  if (initial.status === "answered" || initial.status === "failed")
    return initial;
  for (let attempt = 0; attempt < 75; attempt += 1) {
    if (attempt > 0)
      await new Promise((resolve) => window.setTimeout(resolve, 1_200));
    try {
      const question = await client.getQuestion(initial.questionId);
      onProgress(question);
      if (question.status === "answered" || question.status === "failed")
        return question;
    } catch (error) {
      if (
        error instanceof ResearchRequestError &&
        error.status >= 400 &&
        error.status < 500
      )
        throw error;
    }
  }
  return { ...initial, status: "failed" };
}

export function useAgentConsultation({
  client: providedClient,
  locale,
  reportId,
}: Options) {
  const [client] = useState<QuestionClient>(
    () => providedClient ?? createAuthenticatedResearchClient(),
  );
  const mounted = useRef(true);
  const [messages, setMessages] = useState<readonly ConsultationMessage[]>(() =>
    loadConsultationMessages(reportId),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    saveConsultationMessages(reportId, messages);
  }, [messages, reportId]);

  const ask = async (input: AskInput): Promise<void> => {
    const trimmed = input.question.trim();
    if (!trimmed || isSubmitting) return;
    const messageId = globalThis.crypto.randomUUID();
    const answerId = globalThis.crypto.randomUUID();
    const lookupPlan = questionLookupPlan({ en: trimmed, ko: trimmed });
    setMessages((current) => [
      ...current,
      {
        id: messageId,
        kind: "question",
        agentId: input.agent.id,
        text: trimmed,
      },
      {
        id: answerId,
        kind: "answer",
        agentId: input.agent.id,
        state: "pending",
        activity: lookupPlan.mode === "external" ? "searching" : "thinking",
        paragraphs: [],
        evidence: [],
      },
    ]);
    setIsSubmitting(true);
    try {
      const questionInput = {
        reportId,
        question: consultationPayload(
          { ...input, question: trimmed },
          locale,
          messages,
        ),
        locale,
        idempotencyKey: globalThis.crypto.randomUUID(),
      } as const;
      const created = await client.askQuestion(questionInput);
      const updateActivity = (progress: PublicQuestion): void => {
        if (!mounted.current) return;
        setMessages((current) =>
          current.map((message) =>
            message.id === answerId && message.kind === "answer"
              ? { ...message, activity: progress.activity }
              : message,
          ),
        );
      };
      updateActivity(created);
      let result = await waitForAnswer(client, created, updateActivity);
      if (result.status === "failed") {
        const retried = await client.askQuestion({
          ...questionInput,
          retryOfQuestionId: result.questionId,
          idempotencyKey: globalThis.crypto.randomUUID(),
        });
        updateActivity(retried);
        result = await waitForAnswer(client, retried, updateActivity);
      }
      if (!mounted.current) return;
      setMessages((current) =>
        current.map((message) =>
          message.id !== answerId || message.kind !== "answer"
            ? message
            : result.status === "answered" && result.answer !== undefined
              ? {
                  ...message,
                  state: "answered",
                  paragraphs:
                    result.answer.summary === null
                      ? result.answer.elements.map(
                          (element) => element.text[locale],
                        )
                      : [result.answer.summary[locale]],
                  evidence: [
                    ...result.answer.elements.map((element) => ({
                      label: element.text[locale],
                      claimId: element.claimId,
                      sourceIds: element.sourceIds,
                    })),
                    ...result.answer.externalSources.map((source) => ({
                      label: `${source.publisher} · ${source.title}`,
                      url: source.url,
                    })),
                  ],
                }
              : {
                  ...message,
                  state: "failed",
                  errorCode: "CONSULTATION_FAILED",
                },
        ),
      );
    } catch (error) {
      if (!mounted.current) return;
      setMessages((current) =>
        current.map((message) =>
          message.id !== answerId || message.kind !== "answer"
            ? message
            : {
                ...message,
                state: "failed",
                errorCode: failureCode(error),
              },
        ),
      );
    } finally {
      if (mounted.current) setIsSubmitting(false);
    }
  };

  return { ask, isSubmitting, messages } as const;
}

import { describe, expect, it } from "vitest";
import { PublicQuestionSchema } from "../../research/client/schemas";
import { consultationMessagesFromQuestions } from "./agentConsultationMemory";

describe("consultationMessagesFromQuestions", () => {
  it("restores the selected specialist and grounded answer from server history", () => {
    const question = PublicQuestionSchema.parse({
      questionId: "00000000-0000-4000-8000-000000000001",
      reportId: "00000000-0000-4000-8000-000000000002",
      reportVersionId: "00000000-0000-4000-8000-000000000003",
      attemptOrdinal: 1,
      status: "answered",
      activity: "thinking",
      question: {
        en: JSON.stringify({
          specialist: { id: "valuation" },
          userQuestion: {
            en: "Is the valuation defensible?",
            ko: "밸류에이션을 정당화할 수 있나요?",
          },
        }),
        ko: JSON.stringify({
          specialist: { id: "valuation" },
          userQuestion: {
            en: "Is the valuation defensible?",
            ko: "밸류에이션을 정당화할 수 있나요?",
          },
        }),
      },
      answer: {
        summary: {
          en: "The evidence supports a conditional premium.",
          ko: "근거는 조건부 프리미엄을 지지합니다.",
        },
        elements: [
          {
            claimId: "00000000-0000-4000-8000-000000000004",
            sourceIds: ["00000000-0000-4000-8000-000000000005"],
            text: {
              en: "Margins remain the central validation point.",
              ko: "마진이 핵심 검증 지표입니다.",
            },
          },
        ],
        externalSources: [],
      },
      createdAt: "2026-07-29T01:00:00.000Z",
    });

    const messages = consultationMessagesFromQuestions([question], "ko");

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      kind: "question",
      agentId: "valuation",
      text: "밸류에이션을 정당화할 수 있나요?",
    });
    expect(messages[1]).toMatchObject({
      kind: "answer",
      agentId: "valuation",
      state: "answered",
      paragraphs: ["근거는 조건부 프리미엄을 지지합니다."],
    });
  });

  it("keeps only the terminal retry so a failed attempt is not duplicated", () => {
    const base = {
      reportId: "00000000-0000-4000-8000-000000000002",
      reportVersionId: "00000000-0000-4000-8000-000000000003",
      activity: "thinking" as const,
      question: {
        en: JSON.stringify({
          specialist: { id: "risk" },
          userQuestion: { en: "What breaks?", ko: "무엇이 깨지나요?" },
        }),
        ko: JSON.stringify({
          specialist: { id: "risk" },
          userQuestion: { en: "What breaks?", ko: "무엇이 깨지나요?" },
        }),
      },
      createdAt: "2026-07-29T01:00:00.000Z",
    };
    const failed = PublicQuestionSchema.parse({
      ...base,
      questionId: "00000000-0000-4000-8000-000000000010",
      attemptOrdinal: 1,
      status: "failed",
    });
    const retry = PublicQuestionSchema.parse({
      ...base,
      questionId: "00000000-0000-4000-8000-000000000011",
      retryOfQuestionId: failed.questionId,
      attemptOrdinal: 2,
      status: "failed",
    });

    const messages = consultationMessagesFromQuestions([failed, retry], "en");

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: retry.questionId,
      text: "What breaks?",
    });
  });
});

import { describe, expect, it } from "vitest";
import { PersistedQuestionSchema, validateGroundedAnswer } from "./question";

const question = {
  schemaVersion: "workflow-v1",
  questionId: "00000000-0000-4000-8000-000000000001",
  reportId: "00000000-0000-4000-8000-000000000002",
  reportVersionId: "00000000-0000-4000-8000-000000000003",
  runId: "00000000-0000-4000-8000-000000000004",
  snapshotId: "00000000-0000-4000-8000-000000000005",
  attemptOrdinal: 1,
  status: "answered",
  question: { en: "What changed?", ko: "무엇이 바뀌었나요?" },
  answer: {
    elements: [
      {
        claimId: "00000000-0000-4000-8000-000000000006",
        sourceIds: ["00000000-0000-4000-8000-000000000007"],
        text: {
          en: "Operating margin improved according to the filing.",
          ko: "공시에 따르면 영업이익률이 개선되었습니다.",
        },
      },
    ],
  },
} as const;

const published = {
  questionId: question.questionId,
  attemptOrdinal: question.attemptOrdinal,
  reportId: question.reportId,
  reportVersionId: question.reportVersionId,
  runId: question.runId,
  snapshotId: question.snapshotId,
  claims: [
    {
      claimId: "00000000-0000-4000-8000-000000000006",
      sourceIds: ["00000000-0000-4000-8000-000000000007"],
      text: {
        en: "Operating margin improved according to the filing.",
        ko: "공시에 따르면 영업이익률이 개선되었습니다.",
      },
    },
  ],
  sources: ["00000000-0000-4000-8000-000000000007"],
} as const;

describe("persisted Q&A wire contract", () => {
  it("accepts an answer grounded only in published claim/source IDs", () => {
    expect(validateGroundedAnswer(question, published)).toEqual({
      valid: true,
      reasons: [],
    });
    expect(PersistedQuestionSchema.parse(question).status).toBe("answered");
  });

  it("rejects newly invented prose, fact, or source", () => {
    expect(
      validateGroundedAnswer(
        {
          ...question,
          answer: {
            elements: [
              {
                claimId: "00000000-0000-4000-8000-000000000099",
                sourceIds: ["00000000-0000-4000-8000-000000000098"],
                text: {
                  en: "Invented revenue increased.",
                  ko: "매출이 증가했다는 새로운 주장입니다.",
                },
              },
            ],
          },
        },
        published,
      ),
    ).toEqual({
      valid: false,
      reasons: [
        "unknown_claim:00000000-0000-4000-8000-000000000099",
        "unknown_source:00000000-0000-4000-8000-000000000098",
      ],
    });
  });

  it("rejects arbitrary prose, empty grounding, and altered source sets", () => {
    const changedText = {
      ...question,
      answer: {
        elements: [
          {
            ...question.answer.elements[0],
            text: { en: "Invented sentence.", ko: "지어낸 문장입니다." },
          },
        ],
      },
    };
    expect(validateGroundedAnswer(changedText, published)).toEqual({
      valid: false,
      reasons: ["claim_text_mismatch:00000000-0000-4000-8000-000000000006"],
    });
    expect(
      PersistedQuestionSchema.safeParse({
        ...question,
        answer: { elements: [] },
      }).success,
    ).toBe(false);
    const changedSources = {
      ...question,
      answer: {
        elements: [
          {
            ...question.answer.elements[0],
            sourceIds: [],
          },
        ],
      },
    };
    expect(validateGroundedAnswer(changedSources, published)).toEqual({
      valid: false,
      reasons: ["claim_sources_mismatch:00000000-0000-4000-8000-000000000006"],
    });
    expect(
      PersistedQuestionSchema.safeParse({
        ...question,
        answer: {
          elements: [question.answer.elements[0], question.answer.elements[0]],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects cross-lineage question/report context", () => {
    expect(
      validateGroundedAnswer(
        { ...question, snapshotId: "00000000-0000-4000-8000-000000000099" },
        published,
      ),
    ).toEqual({ valid: false, reasons: ["question_lineage_mismatch"] });
    expect(
      validateGroundedAnswer(
        {
          ...question,
          retryOfQuestionId: "00000000-0000-4000-8000-000000000090",
        },
        {
          ...published,
          retryOfQuestionId: "00000000-0000-4000-8000-000000000091",
        },
      ),
    ).toEqual({ valid: false, reasons: ["question_lineage_mismatch"] });
  });

  it("rejects question, ordinal, and retry lineage mismatch", () => {
    expect(
      validateGroundedAnswer(question, {
        ...published,
        questionId: "00000000-0000-4000-8000-000000000099",
        attemptOrdinal: 2,
      }),
    ).toEqual({ valid: false, reasons: ["question_lineage_mismatch"] });
  });

  it("rejects private fields, invalid status, and mismatched bilingual answer shape", () => {
    expect(
      PersistedQuestionSchema.safeParse({ ...question, prompt: "secret" })
        .success,
    ).toBe(false);
    expect(
      PersistedQuestionSchema.safeParse({ ...question, status: "complete" })
        .success,
    ).toBe(false);
    expect(
      PersistedQuestionSchema.safeParse({
        ...question,
        answer: {
          elements: [
            { ...question.answer.elements[0], text: { en: "Only English" } },
          ],
        },
      }).success,
    ).toBe(false);
  });
});

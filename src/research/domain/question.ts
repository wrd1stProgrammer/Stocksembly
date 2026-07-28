import { z } from "zod";
import {
  ClaimIdSchema,
  QuestionIdSchema,
  ReportIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
  SourceIdSchema,
} from "./ids";
import { LocalizedTextSchema, ReportNarrativeTextSchema } from "./report";

export const AnswerElementSchema = z
  .object({
    claimId: ClaimIdSchema,
    sourceIds: z.array(SourceIdSchema),
    text: z
      .object({
        en: ReportNarrativeTextSchema,
        ko: ReportNarrativeTextSchema,
      })
      .strict(),
  })
  .strict();
export const ExternalAnswerSourceSchema = z
  .object({
    url: z.string().url().max(8_192),
    title: z.string().trim().min(1).max(1_024),
    publisher: z.string().trim().min(1).max(512),
    retrievedAt: z.string().datetime(),
    excerpt: z.string().trim().min(1).max(2_000),
  })
  .strict();
export type ExternalAnswerSource = z.infer<typeof ExternalAnswerSourceSchema>;

export const GroundedAnswerSchema = z
  .object({
    summary: z
      .object({
        en: ReportNarrativeTextSchema,
        ko: ReportNarrativeTextSchema,
      })
      .strict()
      .nullable()
      .default(null),
    elements: z.array(AnswerElementSchema),
    externalSources: z.array(ExternalAnswerSourceSchema).max(3).default([]),
  })
  .strict()
  .refine(
    (answer) => answer.elements.length + answer.externalSources.length > 0,
    { message: "answer must include report or external evidence" },
  )
  .refine(
    (answer) =>
      new Set(answer.elements.map((element) => element.claimId)).size ===
      answer.elements.length,
    { message: "answer claim IDs must be unique" },
  );

export const PersistedQuestionSchema = z
  .object({
    schemaVersion: z.literal("workflow-v1"),
    questionId: QuestionIdSchema,
    retryOfQuestionId: QuestionIdSchema.optional(),
    reportId: ReportIdSchema,
    reportVersionId: ReportVersionIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    attemptOrdinal: z.number().int().min(1).max(20),
    status: z.enum([
      "pending",
      "spawn_reserved",
      "running",
      "answered",
      "failed",
    ]),
    question: LocalizedTextSchema,
    answer: GroundedAnswerSchema.optional(),
  })
  .strict()
  .superRefine((question, context) => {
    if ((question.status === "answered") !== (question.answer !== undefined))
      context.addIssue({
        code: "custom",
        path: ["answer"],
        message: "answer must exist only for answered status",
      });
    if (question.retryOfQuestionId === question.questionId)
      context.addIssue({
        code: "custom",
        path: ["retryOfQuestionId"],
        message: "question cannot retry itself",
      });
  });
export type PersistedQuestion = z.infer<typeof PersistedQuestionSchema>;

export const PublishedQuestionContextSchema = z
  .object({
    questionId: QuestionIdSchema,
    retryOfQuestionId: QuestionIdSchema.optional(),
    attemptOrdinal: z.number().int().min(1).max(20),
    reportId: ReportIdSchema,
    reportVersionId: ReportVersionIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    claims: z.array(AnswerElementSchema).min(1),
    sources: z.array(SourceIdSchema),
  })
  .strict()
  .refine(
    (context) =>
      new Set(context.claims.map((claim) => claim.claimId)).size ===
        context.claims.length &&
      new Set(context.sources).size === context.sources.length,
    { message: "published grounding IDs must be unique" },
  );
export type PublishedQuestionContext = z.infer<
  typeof PublishedQuestionContextSchema
>;

export type GroundedAnswerValidation = {
  readonly valid: boolean;
  readonly reasons: readonly string[];
};

export function validateGroundedAnswer(
  questionInput: unknown,
  publishedInput: unknown,
): GroundedAnswerValidation {
  const question = PersistedQuestionSchema.parse(questionInput);
  const published = PublishedQuestionContextSchema.parse(publishedInput);
  if (
    question.questionId !== published.questionId ||
    question.retryOfQuestionId !== published.retryOfQuestionId ||
    question.attemptOrdinal !== published.attemptOrdinal ||
    question.reportId !== published.reportId ||
    question.reportVersionId !== published.reportVersionId ||
    question.runId !== published.runId ||
    question.snapshotId !== published.snapshotId
  )
    return { valid: false, reasons: ["question_lineage_mismatch"] };
  const answer = question.answer;
  if (answer === undefined)
    return { valid: false, reasons: ["answer_missing"] };
  const claims = new Map(
    published.claims.map((claim) => [claim.claimId, claim]),
  );
  const sourceIds = new Set(published.sources);
  const reasons: string[] = [];
  for (const element of answer.elements) {
    const claim = claims.get(element.claimId);
    if (claim === undefined) reasons.push(`unknown_claim:${element.claimId}`);
    else {
      if (
        element.text.en !== claim.text.en ||
        element.text.ko !== claim.text.ko
      )
        reasons.push(`claim_text_mismatch:${element.claimId}`);
      if (
        JSON.stringify([...element.sourceIds].sort()) !==
        JSON.stringify([...claim.sourceIds].sort())
      )
        reasons.push(`claim_sources_mismatch:${element.claimId}`);
    }
    for (const sourceId of element.sourceIds)
      if (!sourceIds.has(sourceId)) reasons.push(`unknown_source:${sourceId}`);
  }
  return { valid: reasons.length === 0, reasons };
}

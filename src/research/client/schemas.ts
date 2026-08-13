import { z } from "zod";
import { ACTIVE_RESEARCH_ACTIVITY_KINDS } from "../domain/activeResearchActivity";
import { GroundedAnswerSchema } from "../domain/question";
import { ResearchProfileSchema } from "../domain/researchProfile";
import { ResearchTargetSchema } from "../domain/researchTarget";
import { WorkflowActorIdSchema } from "../domain/roleRegistry";
import { RUN_STATUS } from "../domain/runStateContracts";
import { WORKFLOW_PUBLIC_EVENT_KINDS } from "../workflow/publicEventsContracts";

const UuidSchema = z.uuid();

export const PublicRunSchema = z
  .strictObject({
    runId: UuidSchema,
    snapshotId: UuidSchema,
    symbol: z.string().regex(/^[A-Z]{1,5}$/u),
    question: z.string().max(4_000).optional(),
    locale: z.enum(["en", "ko"]),
    researchTarget: ResearchTargetSchema.optional(),
    researchProfile: ResearchProfileSchema.optional(),
    status: z.enum([
      RUN_STATUS.queued,
      RUN_STATUS.running,
      RUN_STATUS.cancelling,
      RUN_STATUS.completed,
      RUN_STATUS.completeWithLimitations,
      RUN_STATUS.cancelled,
      RUN_STATUS.failed,
      RUN_STATUS.incomplete,
    ]),
    lastEventSeq: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    reportId: UuidSchema.optional(),
  })
  .readonly();

const PublicIdsSchema = z.array(z.string().min(1).max(160)).max(256).readonly();

export const PublicResearchEventSchema = z
  .strictObject({
    sequence: z.number().int().positive(),
    kind: z.enum(WORKFLOW_PUBLIC_EVENT_KINDS),
    occurredAt: z.iso.datetime(),
    stateId: z.string().min(1).max(160),
    summary: z
      .strictObject({ en: z.string(), ko: z.string() })
      .readonly()
      .optional(),
    actorId: z.string().min(1).max(160).optional(),
    artifactId: UuidSchema.optional(),
    logicalArtifactId: z.string().min(1).max(160).optional(),
    reportId: UuidSchema.optional(),
    reportVersionId: UuidSchema.optional(),
    participantIds: PublicIdsSchema,
    claimIds: PublicIdsSchema,
    sourceIds: PublicIdsSchema,
    limitationIds: PublicIdsSchema,
  })
  .readonly();

export const PublicRunDetailSchema = z
  .strictObject({
    run: PublicRunSchema,
    events: z.array(PublicResearchEventSchema).readonly(),
    activeAgentIds: z.array(WorkflowActorIdSchema).readonly().optional(),
    activeActivities: z
      .array(
        z
          .strictObject({
            actorId: WorkflowActorIdSchema,
            activity: z.enum(ACTIVE_RESEARCH_ACTIVITY_KINDS),
          })
          .readonly(),
      )
      .readonly()
      .optional(),
  })
  .readonly();

export const PublicRunListResponseSchema = z
  .strictObject({
    runs: z.array(PublicRunSchema).readonly(),
    nextCursor: z.string().min(1).optional(),
  })
  .readonly();

export const CreateRunResponseSchema = z
  .strictObject({ run: PublicRunSchema })
  .readonly();

export const CancelRunResponseSchema = z
  .strictObject({
    run: z
      .strictObject({
        runId: UuidSchema,
        status: z.enum([RUN_STATUS.cancelling, RUN_STATUS.cancelled]),
      })
      .readonly(),
  })
  .readonly();

export const ChildRunResponseSchema = z
  .strictObject({
    run: z
      .strictObject({
        runId: UuidSchema,
        snapshotId: UuidSchema,
        status: z.literal(RUN_STATUS.queued),
        parentRunId: UuidSchema,
        lineage: z.enum(["same-snapshot-retry", "new-snapshot-follow-up"]),
        reportId: UuidSchema.optional(),
        version: z.number().int().positive().optional(),
      })
      .readonly(),
  })
  .readonly();

export const RecoveredRunResponseSchema = z
  .strictObject({
    run: z
      .strictObject({
        runId: UuidSchema,
        snapshotId: UuidSchema,
        status: z.literal(RUN_STATUS.running),
        recovery: z.literal("same-run-stage-resume"),
      })
      .readonly(),
  })
  .readonly();

export const PublicQuestionSchema = z
  .strictObject({
    questionId: UuidSchema,
    retryOfQuestionId: UuidSchema.optional(),
    reportId: UuidSchema,
    reportVersionId: UuidSchema,
    attemptOrdinal: z.number().int().min(1).max(20),
    status: z.enum([
      "pending",
      "spawn_reserved",
      "running",
      "answered",
      "failed",
    ]),
    activity: z.enum(["searching", "thinking"]).default("thinking"),
    question: z.strictObject({ en: z.string(), ko: z.string() }),
    answer: GroundedAnswerSchema.optional(),
    createdAt: z.iso.datetime(),
  })
  .readonly();

export const PublicQuestionResponseSchema = z
  .strictObject({ question: PublicQuestionSchema })
  .readonly();

export const PublicQuestionListResponseSchema = z
  .strictObject({
    questions: z.array(PublicQuestionSchema).readonly(),
  })
  .readonly();

export const ApiErrorResponseSchema = z
  .strictObject({
    error: z.strictObject({ code: z.string().min(1) }),
  })
  .readonly();

export type PublicRun = z.infer<typeof PublicRunSchema>;
export type PublicResearchEvent = z.infer<typeof PublicResearchEventSchema>;
export type PublicRunDetail = z.infer<typeof PublicRunDetailSchema>;
export type ChildRun = z.infer<typeof ChildRunResponseSchema>["run"];
export type RecoveredRun = z.infer<typeof RecoveredRunResponseSchema>["run"];
export type PublicQuestion = z.infer<
  typeof PublicQuestionResponseSchema
>["question"];

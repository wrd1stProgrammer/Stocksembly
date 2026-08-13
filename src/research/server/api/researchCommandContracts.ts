import { z } from "zod";
import { GroundedAnswerSchema } from "../../domain/question";

export const PublicQuestionSchema = z
  .object({
    questionId: z.string().uuid(),
    retryOfQuestionId: z.string().uuid().optional(),
    reportId: z.string().uuid(),
    reportVersionId: z.string().uuid(),
    attemptOrdinal: z.number().int().min(1).max(20),
    status: z.enum([
      "pending",
      "spawn_reserved",
      "running",
      "answered",
      "failed",
    ]),
    activity: z.enum(["searching", "thinking"]).default("thinking"),
    question: z.object({ en: z.string(), ko: z.string() }).strict(),
    answer: GroundedAnswerSchema.optional(),
    createdAt: z.string().datetime(),
  })
  .strict()
  .readonly();
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;

export type CommandIds = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly jobId: string;
  readonly eventId: string;
  readonly questionId: string;
};

export type QuestionGrounding = {
  readonly reportVersionId: string;
  readonly reportArtifactDigest: string;
  readonly inputHash: string;
  readonly question: { readonly en: string; readonly ko: string };
};

export type CommandResult<Value> =
  | { readonly kind: "created" | "replayed"; readonly value: Value }
  | {
      readonly kind:
        | "conflict"
        | "not_found"
        | "illegal_state"
        | "quota_exhausted"
        | "active_question";
    };

export const CancelledRunSchema = z
  .object({
    runId: z.string().uuid(),
    status: z.enum(["cancelled", "cancelling"]),
  })
  .strict()
  .readonly();
export type CancelledRun = z.infer<typeof CancelledRunSchema>;

export const ChildRunSchema = z
  .object({
    runId: z.string().uuid(),
    snapshotId: z.string().uuid(),
    status: z.literal("queued"),
    parentRunId: z.string().uuid(),
    lineage: z.enum(["same-snapshot-retry", "new-snapshot-follow-up"]),
    reportId: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .readonly();
export type ChildRun = z.infer<typeof ChildRunSchema>;

export const RecoveredRunSchema = z
  .object({
    runId: z.string().uuid(),
    snapshotId: z.string().uuid(),
    status: z.literal("running"),
    recovery: z.literal("same-run-stage-resume"),
  })
  .strict()
  .readonly();
export type RecoveredRun = z.infer<typeof RecoveredRunSchema>;

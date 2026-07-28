import { z } from "zod";
import {
  AttemptIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "./ids";

const TimestampSchema = z.string().datetime({ offset: true });
export const AttemptSchema = z
  .object({
    id: AttemptIdSchema,
    jobId: JobIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    kind: z.enum(["research", "qa"]),
    status: z.enum([
      "created",
      "spawn-reserved",
      "running",
      "unknown",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    ordinal: z.number().int().positive().optional(),
    ordinalKind: z.enum(["research", "qa"]).optional(),
    ordinalState: z.enum(["unreserved", "burned"]).default("unreserved"),
    immutable: z.literal(true),
    createdAt: TimestampSchema,
    outcome: z.enum(["accepted", "failed", "cancelled", "unknown"]).optional(),
  })
  .strict()
  .superRefine((attempt, context) => {
    if (
      attempt.ordinalState === "burned" &&
      (attempt.ordinal === undefined || attempt.ordinalKind === undefined)
    )
      context.addIssue({
        code: "custom",
        path: ["ordinal"],
        message: "burned attempts require a durable ordinal and kind",
      });
    if (
      attempt.ordinalKind !== undefined &&
      attempt.ordinalKind !== attempt.kind
    )
      context.addIssue({
        code: "custom",
        path: ["ordinalKind"],
        message: "ordinal kind must match attempt kind",
      });
    if (
      attempt.ordinalState === "unreserved" &&
      (attempt.ordinal !== undefined || attempt.ordinalKind !== undefined)
    )
      context.addIssue({
        code: "custom",
        path: ["ordinalState"],
        message: "unreserved attempts cannot carry an ordinal",
      });
    if (
      attempt.status === "spawn-reserved" &&
      attempt.ordinalState !== "burned"
    )
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "spawn-reserved attempts must burn their ordinal",
      });
    if (attempt.status === "created" && attempt.ordinalState !== "unreserved")
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "created attempts cannot consume a launch ordinal",
      });
  });
export type AttemptRecord = z.infer<typeof AttemptSchema>;

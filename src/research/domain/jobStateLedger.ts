import { z } from "zod";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "./ids";

export const LaunchEntrySchema = z
  .object({
    ordinal: z.number().int().positive(),
    kind: z.enum(["research", "qa"]),
    runId: RunIdSchema,
    jobId: JobIdSchema,
    attemptId: AttemptIdSchema,
    reservedAt: z.string().datetime({ offset: true }),
    state: z.literal("burned"),
  })
  .strict();
export type LaunchEntry = z.infer<typeof LaunchEntrySchema>;
export const LaunchLedgerSchema = z
  .object({
    kind: z.enum(["research", "qa"]),
    nextOrdinal: z.number().int().positive(),
    entries: z.array(LaunchEntrySchema).readonly(),
  })
  .strict()
  .superRefine((ledger, context) => {
    if (ledger.nextOrdinal !== ledger.entries.length + 1)
      context.addIssue({
        code: "custom",
        path: ["nextOrdinal"],
        message: "next ordinal must follow the durable entry count",
      });
    const attempts = new Set<string>();
    const jobs = new Set<string>();
    ledger.entries.forEach((entry, index) => {
      if (entry.ordinal !== index + 1 || entry.kind !== ledger.kind)
        context.addIssue({
          code: "custom",
          path: ["entries", index],
          message: "launch ordinals must be contiguous and ledger-scoped",
        });
      if (attempts.has(entry.attemptId) || jobs.has(entry.jobId))
        context.addIssue({
          code: "custom",
          path: ["entries", index],
          message: "launch attempt and job identities must be unique",
        });
      attempts.add(entry.attemptId);
      jobs.add(entry.jobId);
    });
  });
export type LaunchLedger = z.infer<typeof LaunchLedgerSchema>;
export function createLaunchLedger(kind: "research" | "qa"): LaunchLedger {
  return Object.freeze({ kind, nextOrdinal: 1, entries: Object.freeze([]) });
}

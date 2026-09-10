import { z } from "zod";

export const RESEARCH_EXECUTION_LIMITS = Object.freeze({
  subscription: 4,
  api: 6,
  total: 10,
  jobsPerRun: 10,
});

export const ResearchExecutionBackendSchema = z.enum(["subscription", "api"]);
export type ResearchExecutionBackend = z.infer<
  typeof ResearchExecutionBackendSchema
>;

export const ResearchQueueStatusSchema = z
  .object({
    position: z.number().int().positive(),
    activeRuns: z.number().int().nonnegative(),
    capacity: z.number().int().positive(),
  })
  .strict()
  .readonly();
export type ResearchQueueStatus = z.infer<typeof ResearchQueueStatusSchema>;

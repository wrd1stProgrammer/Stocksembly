import { z } from "zod";
import { assertNever, type EventId, type ReportId, type RunId } from "./ids";
import type { RunStatus } from "./runStateContracts";

export const RunNextJobSchema = z
  .object({
    kind: z.string().trim().min(1).max(120),
    logicalKey: z.string().trim().min(1).max(300),
  })
  .strict();
export type RunNextJob = z.infer<typeof RunNextJobSchema>;

export type RunPublicEvent = {
  readonly id: EventId;
  readonly runId: RunId;
  readonly sequence: number;
  readonly type:
    | "run_queued"
    | "run_started"
    | "run_cancelling"
    | "run_cancelled"
    | "run_failed"
    | "run_incomplete"
    | "report_published";
  readonly stateId: string;
  readonly createdAt: string;
  readonly reportId?: ReportId;
};

export function runEventTypeFor(status: RunStatus): RunPublicEvent["type"] {
  switch (status) {
    case "queued":
      return "run_queued";
    case "running":
      return "run_started";
    case "cancelling":
      return "run_cancelling";
    case "cancelled":
      return "run_cancelled";
    case "failed":
      return "run_failed";
    case "incomplete":
      return "run_incomplete";
    case "completed":
    case "complete-with-limitations":
      return "report_published";
    default:
      return assertNever(status);
  }
}

import { z } from "zod";
import type { EventLedger } from "./eventStateLedger";
import { ReportIdSchema, RunIdSchema, SnapshotIdSchema } from "./ids";
import {
  type RunNextJob,
  RunNextJobSchema,
  type RunPublicEvent,
} from "./runStateEvents";
import {
  type CreateChildRunInput,
  type RunLineage,
  RunLineageSchema,
} from "./runStateLineage";

export type { RunNextJob, RunPublicEvent } from "./runStateEvents";

export const RUN_STATUS = {
  queued: "queued",
  running: "running",
  cancelling: "cancelling",
  completed: "completed",
  completeWithLimitations: "complete-with-limitations",
  cancelled: "cancelled",
  failed: "failed",
  incomplete: "incomplete",
} as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];
export const RunStatusSchema = z.enum([
  RUN_STATUS.queued,
  RUN_STATUS.running,
  RUN_STATUS.cancelling,
  RUN_STATUS.completed,
  RUN_STATUS.completeWithLimitations,
  RUN_STATUS.cancelled,
  RUN_STATUS.failed,
  RUN_STATUS.incomplete,
]);
export const RunStateSchema = z.object({ status: RunStatusSchema }).strict();
export const RUN_TERMINAL_STATUSES = [
  RUN_STATUS.completed,
  RUN_STATUS.completeWithLimitations,
  RUN_STATUS.cancelled,
  RUN_STATUS.failed,
  RUN_STATUS.incomplete,
] as const satisfies readonly RunStatus[];
export const RUN_TRANSITIONS = {
  queued: [
    RUN_STATUS.running,
    RUN_STATUS.cancelling,
    RUN_STATUS.cancelled,
    RUN_STATUS.failed,
  ],
  running: [
    RUN_STATUS.cancelling,
    RUN_STATUS.completed,
    RUN_STATUS.completeWithLimitations,
    RUN_STATUS.failed,
    RUN_STATUS.incomplete,
  ],
  cancelling: [RUN_STATUS.cancelled, RUN_STATUS.failed],
  completed: [],
  "complete-with-limitations": [],
  cancelled: [],
  failed: [],
  incomplete: [],
} as const satisfies Readonly<Record<RunStatus, readonly RunStatus[]>>;
export const TimestampSchema = z.string().datetime({ offset: true });
export const ReportPublicationSchema = z
  .object({ reportId: ReportIdSchema, publishedAt: TimestampSchema })
  .strict();
export const RunRecordSchema = z
  .object({
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    status: RunStatusSchema,
    createdAt: TimestampSchema,
    eventSeq: z.number().int().nonnegative(),
    reportId: ReportIdSchema.optional(),
    reportPublishedAt: TimestampSchema.optional(),
    lineage: RunLineageSchema.optional(),
  })
  .strict()
  .superRefine((record, context) => {
    const hasReportId = record.reportId !== undefined;
    const hasPublishedAt = record.reportPublishedAt !== undefined;
    if (hasReportId !== hasPublishedAt) {
      context.addIssue({
        code: "custom",
        path: [hasReportId ? "reportPublishedAt" : "reportId"],
        message: "report identity and publication time must be paired",
      });
    }
    if (
      (record.status === RUN_STATUS.completed ||
        record.status === RUN_STATUS.completeWithLimitations) &&
      (!hasReportId || !hasPublishedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "published terminal runs require a report",
      });
    }
    if (
      record.status !== RUN_STATUS.completed &&
      record.status !== RUN_STATUS.completeWithLimitations &&
      (hasReportId || hasPublishedAt)
    )
      context.addIssue({
        code: "custom",
        path: ["reportId"],
        message: "only publishable terminal runs may retain a report",
      });
    if (
      record.lineage !== undefined &&
      (record.status !== RUN_STATUS.queued || record.eventSeq !== 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["lineage"],
        message: "child lineage is only valid on a newly queued run",
      });
    }
  });
export const DurableRunSchema = RunRecordSchema;
export type RunRecordData = z.infer<typeof RunRecordSchema>;
export type RunRecord = RunRecordData & {
  readonly child: (input: CreateChildRunInput) => ChildRunResult;
};
export type CreateRunInput = {
  readonly runId: string;
  readonly snapshotId: string;
  readonly createdAt: string;
};
export type RunTransitionContext = {
  readonly now: string;
  readonly eventLedger: EventLedger;
  readonly report?: { readonly reportId: string; readonly publishedAt: string };
  readonly reportPublication?: {
    readonly reportId: string;
    readonly publishedAt: string;
  };
  readonly nextJobs?: readonly RunNextJob[];
};
export { RunNextJobSchema };
export type RunTransitionError =
  | { readonly kind: "invalid_state"; readonly message: string }
  | {
      readonly kind: "illegal_transition";
      readonly from: RunStatus;
      readonly to: RunStatus;
    }
  | { readonly kind: "terminal_immutable"; readonly status: RunStatus }
  | { readonly kind: "report_required" }
  | { readonly kind: "invalid_report"; readonly message: string }
  | { readonly kind: "invalid_lineage"; readonly message: string };
export type RunTransitionSuccess = {
  readonly ok: true;
  readonly state: RunRecord;
  readonly eventLedger: EventLedger;
  readonly transaction: {
    readonly committed: true;
    readonly state: RunRecord;
    readonly eventLedger: EventLedger;
    readonly nextJobs: readonly RunNextJob[];
    readonly event: RunPublicEvent;
  };
  readonly nextJobs: readonly RunNextJob[];
  readonly event: RunPublicEvent;
};
export type RunTransitionResult =
  | RunTransitionSuccess
  | { readonly ok: false; readonly error: RunTransitionError };
export type ChildRunResult =
  | { readonly ok: true; readonly state: RunRecord }
  | { readonly ok: false; readonly error: RunTransitionError };
export type { RunLineage };

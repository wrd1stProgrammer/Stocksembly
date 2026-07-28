import { z } from "zod";
import { createEventLedgerSchema, type EventLedger } from "./eventStateLedger";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  type EventId,
  EventIdSchema,
  JobIdSchema,
  ReportIdSchema,
  RunIdSchema,
} from "./ids";
import { JobStatusSchema } from "./jobStateContracts";
import { RunStatusSchema } from "./runStateContracts";

export const PUBLIC_EVENT_TYPES = [
  "run_queued",
  "run_started",
  "run_cancelling",
  "run_cancelled",
  "run_failed",
  "run_incomplete",
  "report_published",
  "job_queued",
  "job_leased",
  "spawn_reserved",
  "job_started",
  "job_retry_wait",
  "job_cancel_requested",
  "job_cancelled",
  "job_succeeded",
  "job_failed",
  "attempt_unknown",
  "retry_scheduled",
  "follow_up_created",
  "qa_answer_published",
] as const;
export type PublicEventType = (typeof PUBLIC_EVENT_TYPES)[number];
export const PublicEventTypeSchema = z.enum(PUBLIC_EVENT_TYPES);
export const StateIdSchema = z.union([
  RunStatusSchema,
  JobStatusSchema,
  z.literal("report-published"),
]);
type StateId = z.infer<typeof StateIdSchema>;
const expectedState: Readonly<{
  [type in PublicEventType]: readonly StateId[];
}> = {
  run_queued: ["queued"],
  run_started: ["running"],
  run_cancelling: ["cancelling"],
  run_cancelled: ["cancelled"],
  run_failed: ["failed"],
  run_incomplete: ["incomplete"],
  report_published: ["completed", "complete-with-limitations"],
  job_queued: ["queued"],
  job_leased: ["leased"],
  spawn_reserved: ["spawn-reserved"],
  job_started: ["running"],
  job_retry_wait: ["retry-wait"],
  job_cancel_requested: ["cancel-requested"],
  job_cancelled: ["cancelled"],
  job_succeeded: ["succeeded"],
  job_failed: ["failed"],
  attempt_unknown: ["retry-wait"],
  retry_scheduled: ["retry-wait"],
  follow_up_created: ["queued"],
  qa_answer_published: ["succeeded"],
};
const TextSchema = z
  .object({
    en: z.string().max(4_000),
    ko: z.string().max(4_000),
  })
  .strict();
export const TimestampSchema = z.string().datetime({ offset: true });

export const PublicEventSchema = z
  .object({
    id: EventIdSchema,
    runId: RunIdSchema,
    sequence: z.number().int().positive(),
    type: PublicEventTypeSchema,
    stateId: StateIdSchema,
    createdAt: TimestampSchema,
    jobId: JobIdSchema.optional(),
    attemptId: AttemptIdSchema.optional(),
    reportId: ReportIdSchema.optional(),
    artifactId: ArtifactIdSchema.optional(),
    ordinal: z.number().int().positive().optional(),
    summary: TextSchema.optional(),
    detail: TextSchema.optional(),
  })
  .strict()
  .superRefine((event, context) => {
    const states = expectedState[event.type];
    if (states !== undefined && !states.includes(event.stateId)) {
      context.addIssue({
        code: "custom",
        path: ["stateId"],
        message: "event type and state ID disagree",
      });
    }
    if (event.type === "report_published" && event.reportId === undefined)
      context.addIssue({
        code: "custom",
        path: ["reportId"],
        message: "report publication events require a report identity",
      });
    if (event.type.startsWith("job_") && event.jobId === undefined)
      context.addIssue({
        code: "custom",
        path: ["jobId"],
        message: "job events require a job identity",
      });
    if (
      event.type === "spawn_reserved" &&
      (event.jobId === undefined ||
        event.attemptId === undefined ||
        event.ordinal === undefined)
    )
      context.addIssue({
        code: "custom",
        path: ["attemptId"],
        message: "spawn reservations require attempt and ordinal identities",
      });
    if (
      (event.type === "attempt_unknown" || event.type === "retry_scheduled") &&
      event.attemptId === undefined
    )
      context.addIssue({
        code: "custom",
        path: ["attemptId"],
        message: "attempt lifecycle events require an attempt identity",
      });
  });
export type PublicEvent = z.infer<typeof PublicEventSchema>;

export const EventLedgerSchema = createEventLedgerSchema(PublicEventSchema);
export type PublicEventInput = {
  readonly id: string;
  readonly type: PublicEventType;
  readonly stateId: z.infer<typeof StateIdSchema>;
  readonly createdAt: string;
  readonly runId?: string | undefined;
  readonly sequence?: number | undefined;
  readonly jobId?: string | undefined;
  readonly attemptId?: string | undefined;
  readonly reportId?: string | undefined;
  readonly artifactId?: string | undefined;
  readonly ordinal?: number | undefined;
  readonly summary?: { readonly en: string; readonly ko: string } | undefined;
  readonly detail?: { readonly en: string; readonly ko: string } | undefined;
};
export type EventError =
  | { readonly kind: "invalid_event"; readonly message: string }
  | {
      readonly kind: "sequence_gap";
      readonly expected: number;
      readonly received: number;
    }
  | { readonly kind: "run_mismatch" }
  | { readonly kind: "duplicate_event"; readonly id: EventId }
  | { readonly kind: "terminal_duplicate"; readonly type: PublicEventType };
export type AppendEventResult =
  | {
      readonly ok: true;
      readonly ledger: EventLedger;
      readonly event: PublicEvent;
    }
  | { readonly ok: false; readonly error: EventError };

const TERMINAL_EVENT_TYPES = new Set<PublicEventType>([
  "report_published",
  "run_cancelled",
  "run_failed",
  "run_incomplete",
]);

export function createEventLedger(runId: string): EventLedger {
  return Object.freeze({
    runId: RunIdSchema.parse(runId),
    nextSequence: 1,
    events: Object.freeze([]),
  });
}
export function parsePublicEvent(
  value: unknown,
): ReturnType<typeof PublicEventSchema.safeParse> {
  return PublicEventSchema.safeParse(value);
}
export function isTerminalPublicEvent(type: PublicEventType): boolean {
  return TERMINAL_EVENT_TYPES.has(type);
}
export function appendPublicEvent(
  ledger: EventLedger,
  input: PublicEventInput,
): AppendEventResult {
  const parsedLedger = EventLedgerSchema.safeParse(ledger);
  if (!parsedLedger.success)
    return {
      ok: false,
      error: { kind: "invalid_event", message: parsedLedger.error.message },
    };
  const durableLedger = parsedLedger.data;
  const expected = durableLedger.nextSequence;
  if (input.sequence !== undefined && input.sequence !== expected)
    return {
      ok: false,
      error: { kind: "sequence_gap", expected, received: input.sequence },
    };
  if (input.runId !== undefined && input.runId !== durableLedger.runId)
    return { ok: false, error: { kind: "run_mismatch" } };
  if (durableLedger.events.some((event) => event.id === input.id))
    return {
      ok: false,
      error: { kind: "duplicate_event", id: EventIdSchema.parse(input.id) },
    };
  if (
    isTerminalPublicEvent(input.type) &&
    durableLedger.events.some((event) => isTerminalPublicEvent(event.type))
  )
    return {
      ok: false,
      error: { kind: "terminal_duplicate", type: input.type },
    };
  const candidate = {
    ...input,
    runId: durableLedger.runId,
    sequence: expected,
  };
  const parsed = PublicEventSchema.safeParse(candidate);
  if (!parsed.success)
    return {
      ok: false,
      error: { kind: "invalid_event", message: parsed.error.message },
    };
  const event = Object.freeze(parsed.data);
  const nextLedger = Object.freeze({
    runId: durableLedger.runId,
    nextSequence: expected + 1,
    events: Object.freeze([...durableLedger.events, event]),
  });
  return { ok: true, ledger: nextLedger, event };
}
export { eventIdForSequence } from "./eventStateLedger";

import { z } from "zod";
import type { PublicEvent } from "./eventState";
import { type EventId, EventIdSchema, type RunId, RunIdSchema } from "./ids";

const terminalTypes = new Set([
  "report_published",
  "run_cancelled",
  "run_failed",
  "run_incomplete",
]);

export function eventIdForSequence(runId: string, sequence: number): EventId {
  const parsedRunId = RunIdSchema.parse(runId);
  if (!Number.isInteger(sequence) || sequence <= 0)
    throw new Error("event sequence must be a positive integer");
  const tail = parsedRunId.slice(-12);
  const value = (Number.parseInt(tail, 16) + sequence)
    .toString(16)
    .padStart(12, "0")
    .slice(-12);
  return EventIdSchema.parse(`${parsedRunId.slice(0, -12)}${value}`);
}

export function createEventLedgerSchema(eventSchema: z.ZodType<PublicEvent>) {
  return z
    .object({
      runId: RunIdSchema,
      nextSequence: z.number().int().positive(),
      events: z.array(eventSchema).readonly(),
    })
    .strict()
    .superRefine((ledger, context) => {
      if (ledger.nextSequence !== ledger.events.length + 1)
        context.addIssue({
          code: "custom",
          path: ["nextSequence"],
          message: "event sequence must follow the durable event count",
        });
      const ids = new Set<string>();
      let terminalIndex = -1;
      let terminalCount = 0;
      ledger.events.forEach((event, index) => {
        if (event.runId !== ledger.runId || event.sequence !== index + 1)
          context.addIssue({
            code: "custom",
            path: ["events", index],
            message: "rehydrated events must be contiguous and run-scoped",
          });
        if (ids.has(event.id))
          context.addIssue({
            code: "custom",
            path: ["events", index, "id"],
            message: "rehydrated event identities must be unique",
          });
        ids.add(event.id);
        if (terminalTypes.has(event.type)) {
          terminalCount += 1;
          terminalIndex = index;
        }
      });
      if (terminalCount > 1)
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: "a run may have only one terminal event",
        });
      if (terminalIndex >= 0 && terminalIndex !== ledger.events.length - 1)
        context.addIssue({
          code: "custom",
          path: ["events", terminalIndex],
          message: "terminal events must be the final event",
        });
    });
}
export type EventLedger = {
  readonly runId: RunId;
  readonly nextSequence: number;
  readonly events: readonly PublicEvent[];
};

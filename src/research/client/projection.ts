import { z } from "zod";
import { RUN_STATUS, type RunStatus } from "../domain/runStateContracts";
import {
  type PublicResearchEvent,
  PublicResearchEventSchema,
  type PublicRunDetail,
} from "./schemas";
import type { ResearchRunViewState } from "./useResearchRun";

const EventIdSchema = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);

export type ParsedStreamEvent =
  | { readonly kind: "accepted"; readonly event: PublicResearchEvent }
  | { readonly kind: "invalid" };

export function parseStreamEvent(
  message: MessageEvent<string>,
): ParsedStreamEvent {
  const id = EventIdSchema.safeParse(message.lastEventId);
  if (!id.success) return { kind: "invalid" };
  try {
    const event = PublicResearchEventSchema.safeParse(JSON.parse(message.data));
    return event.success && Number(id.data) === event.data.sequence
      ? { kind: "accepted", event: event.data }
      : { kind: "invalid" };
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: "invalid" };
    throw error;
  }
}

export function stateForRun(status: RunStatus): ResearchRunViewState {
  switch (status) {
    case RUN_STATUS.queued:
    case RUN_STATUS.running:
      return "live";
    case RUN_STATUS.cancelling:
      return "cancelling";
    case RUN_STATUS.cancelled:
      return "cancelled";
    case RUN_STATUS.failed:
      return "failed";
    case RUN_STATUS.incomplete:
      return "incomplete";
    case RUN_STATUS.completed:
    case RUN_STATUS.completeWithLimitations:
      return "published";
  }
}

function statusAfterEvent(
  current: RunStatus,
  event: PublicResearchEvent,
): RunStatus {
  switch (event.kind) {
    case "run_created":
      return current;
    case "collection_started":
      return RUN_STATUS.running;
    case "run_cancelling":
      return RUN_STATUS.cancelling;
    case "run_cancelled":
      return RUN_STATUS.cancelled;
    case "run_failed":
      return RUN_STATUS.failed;
    case "run_incomplete":
      return RUN_STATUS.incomplete;
    case "report_published":
      return RUN_STATUS.completed;
    case "evidence_cutoff_recorded":
    case "snapshot_sealed":
    case "mandate_sealed":
    case "specialist_memo_committed":
    case "department_consolidation_committed":
    case "challenge_committed":
    case "followup_committed":
    case "owner_response_committed":
    case "department_ballot_committed":
    case "structural_audit_completed":
    case "semantic_audit_committed":
    case "gathering_started":
    case "committee_classified":
    case "chair_synthesis_committed":
    case "runtime_status":
      return current;
  }
}

export function appendPublicEvent(
  snapshot: PublicRunDetail,
  event: PublicResearchEvent,
): PublicRunDetail {
  const status = statusAfterEvent(snapshot.run.status, event);
  return {
    run: {
      ...snapshot.run,
      status,
      lastEventSeq: event.sequence,
      ...(event.kind === "report_published" && event.reportId !== undefined
        ? { reportId: event.reportId }
        : {}),
    },
    events: [...snapshot.events, event],
  };
}

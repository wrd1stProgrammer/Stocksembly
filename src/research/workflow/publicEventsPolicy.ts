import {
  type PublicEventAppendResult,
  parseWorkflowEventDraft,
  type WorkflowPublicEvent,
  type WorkflowPublicEventAuthority,
  WorkflowPublicEventSchema,
} from "./publicEventsContracts";
import { EVENT_RULES, TERMINAL_EVENT_KINDS } from "./publicEventsRules";
import {
  hasAcceptedArtifact,
  hasValidEventOrder,
  hasValidOwnership,
} from "./publicEventsValidation";

export function appendWorkflowPublicEvent(
  events: readonly WorkflowPublicEvent[],
  draftInput: unknown,
  authorityInput: unknown,
): PublicEventAppendResult {
  if (!isAuthority(authorityInput))
    return { ok: false, reason: "event_authority_invalid" };
  const draft = parseWorkflowEventDraft(draftInput);
  if (draft === undefined) return { ok: false, reason: "public_event_invalid" };
  const rule = EVENT_RULES[draft.kind];
  if (rule.authority !== authorityInput)
    return { ok: false, reason: "event_authority_invalid" };
  const priorSequence = events.at(-1)?.sequence;
  if (
    (priorSequence !== undefined && draft.sequence <= priorSequence) ||
    events.some((event) => event.sequence === draft.sequence)
  )
    return { ok: false, reason: "event_sequence_invalid" };
  if (
    events.some(
      (event) =>
        event.runId !== draft.runId || event.snapshotId !== draft.snapshotId,
    )
  )
    return { ok: false, reason: "cross_run_event" };
  if (events.some((event) => event.eventId === draft.eventId))
    return { ok: false, reason: "duplicate_event" };
  if (events.some((event) => TERMINAL_EVENT_KINDS.has(event.kind)))
    return { ok: false, reason: "event_order_invalid" };
  if (
    authorityInput === "trusted_artifact_commit" &&
    !hasAcceptedArtifact(draft)
  )
    return { ok: false, reason: "accepted_artifact_required" };
  if (
    (draft.kind === "structural_audit_completed" ||
      draft.kind === "report_published") &&
    draft.artifactId === undefined
  )
    return { ok: false, reason: "accepted_artifact_required" };
  if (!hasValidOwnership(draft, authorityInput))
    return { ok: false, reason: "actor_ownership_mismatch" };
  if (!hasValidEventOrder(events, draft))
    return { ok: false, reason: "event_order_invalid" };

  const parsed = WorkflowPublicEventSchema.safeParse({
    ...draft,
    schemaVersion: "workflow-v1",
    phase: rule.phase,
    bubbleEligible: rule.bubbleEligible,
  });
  return parsed.success
    ? { ok: true, event: parsed.data }
    : { ok: false, reason: "public_event_invalid" };
}

export function parseWorkflowPublicEvent(
  input: unknown,
): WorkflowPublicEvent | undefined {
  return WorkflowPublicEventSchema.safeParse(input).data;
}

function isAuthority(input: unknown): input is WorkflowPublicEventAuthority {
  return (
    input === "system" ||
    input === "trusted_artifact_commit" ||
    input === "atomic_report_publication"
  );
}

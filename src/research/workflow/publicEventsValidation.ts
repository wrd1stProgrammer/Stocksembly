import {
  WORKFLOW_V1_DEPARTMENT_IDS,
  WORKFLOW_V1_SPECIALIST_IDS,
} from "../domain/roleRegistry";
import type {
  WorkflowEventDraft,
  WorkflowPublicEvent,
  WorkflowPublicEventAuthority,
} from "./publicEventsContracts";
import { EVENT_RULES } from "./publicEventsRules";
import { publicParticipantsForAgentOutput } from "./publicEventParticipants";

export function hasAcceptedArtifact(draft: WorkflowEventDraft): boolean {
  return (
    draft.artifactId !== undefined && draft.logicalArtifactId !== undefined
  );
}

export function hasValidEventOrder(
  events: readonly WorkflowPublicEvent[],
  draft: WorkflowEventDraft,
): boolean {
  if (draft.kind === "run_cancelling")
    return events.length > 0 && events.at(-1)?.kind !== "run_cancelling";
  if (draft.kind === "run_cancelled")
    return events.at(-1)?.kind === "run_cancelling";
  if (draft.kind === "run_failed" || draft.kind === "run_incomplete")
    return events.length > 0;
  if (draft.kind === "runtime_status") return events.length > 0;
  const currentRule = EVENT_RULES[draft.kind];
  if (count(events, draft.kind) >= currentRule.maximumCount) return false;
  if (
    draft.logicalArtifactId !== undefined &&
    events.some(
      (event) =>
        event.kind === draft.kind &&
        event.logicalArtifactId === draft.logicalArtifactId,
    )
  )
    return false;
  return Object.entries(EVENT_RULES).every(([kind, candidate]) => {
    if (candidate.rank >= currentRule.rank || candidate.requiredCount === 0)
      return true;
    return count(events, kind) >= candidate.requiredCount;
  });
}

export function hasValidOwnership(
  draft: WorkflowEventDraft,
  authority: WorkflowPublicEventAuthority,
): boolean {
  if (authority === "system")
    return draft.kind === "structural_audit_completed"
      ? ownsStructuralAuditEvent(draft)
      : ownsSystemEvent(draft);
  if (authority === "atomic_report_publication")
    return ownsPublicationEvent(draft);
  const logicalId = draft.logicalArtifactId;
  if (logicalId === undefined) return false;
  switch (draft.kind) {
    case "specialist_memo_committed":
      return ownsSpecialist(draft, logicalId, "memo:");
    case "department_consolidation_committed":
      return ownsDepartment(draft, logicalId, "consolidation:");
    case "challenge_committed":
      return ownsDepartment(draft, logicalId, "challenge:");
    case "followup_committed":
      return ownsDepartment(draft, logicalId, "followup:");
    case "owner_response_committed":
    case "department_ballot_committed":
      return ownsDepartment(draft, logicalId, "response_ballot:");
    case "semantic_audit_committed":
      return (
        logicalId === "semantic_audit:system" &&
        draft.actorId === undefined &&
        draft.participantIds.length === 0
      );
    case "chair_synthesis_committed":
      return owns({
        draft,
        logicalId,
        prefix: "chair_synthesis:",
        actor: "chair",
      });
    default:
      return false;
  }
}

function ownsSystemEvent(draft: WorkflowEventDraft): boolean {
  return (
    draft.actorId === undefined &&
    draft.artifactId === undefined &&
    draft.logicalArtifactId === undefined &&
    draft.participantIds.length === 0
  );
}

function ownsPublicationEvent(draft: WorkflowEventDraft): boolean {
  return (
    draft.actorId === undefined &&
    draft.artifactId !== undefined &&
    draft.logicalArtifactId === undefined &&
    draft.participantIds.length === 0 &&
    draft.reportId !== undefined &&
    draft.reportVersionId !== undefined
  );
}

function ownsStructuralAuditEvent(draft: WorkflowEventDraft): boolean {
  return (
    draft.actorId === undefined &&
    draft.artifactId !== undefined &&
    draft.logicalArtifactId === "structural_audit:system" &&
    draft.participantIds.length === 0
  );
}

function ownsSpecialist(
  draft: WorkflowEventDraft,
  logicalId: string,
  prefix: string,
): boolean {
  const actor = draft.actorId;
  return (
    actor !== undefined &&
    WORKFLOW_V1_SPECIALIST_IDS.some((id) => id === actor) &&
    owns({ draft, logicalId, prefix, actor })
  );
}

function ownsDepartment(
  draft: WorkflowEventDraft,
  logicalId: string,
  prefix: string,
): boolean {
  const actor = draft.actorId;
  return (
    actor !== undefined &&
    WORKFLOW_V1_DEPARTMENT_IDS.some((id) => id === actor) &&
    owns({ draft, logicalId, prefix, actor })
  );
}

type OwnershipInput = {
  readonly draft: WorkflowEventDraft;
  readonly logicalId: string;
  readonly prefix: string;
  readonly actor: NonNullable<WorkflowEventDraft["actorId"]>;
};

function owns(input: OwnershipInput): boolean {
  const stageByPrefix = {
    "memo:": "memo",
    "consolidation:": "department_consolidation",
    "challenge:": "blind_challenge",
    "followup:": "follow_up",
    "response_ballot:": "owner_response_ballot",
    "chair_synthesis:": "chair_synthesis",
  } as const;
  const stage = stageByPrefix[input.prefix as keyof typeof stageByPrefix];
  if (stage === undefined) return false;
  const expectedParticipants = publicParticipantsForAgentOutput(
    stage,
    input.actor,
  );
  return (
    input.draft.actorId === input.actor &&
    input.logicalId === `${input.prefix}${input.actor}` &&
    input.draft.participantIds.length === expectedParticipants.length &&
    expectedParticipants.every(
      (participant, index) =>
        input.draft.participantIds[index] === participant,
    )
  );
}

function count(events: readonly WorkflowPublicEvent[], kind: string): number {
  return events.filter((event) => event.kind === kind).length;
}

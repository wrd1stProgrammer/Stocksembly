import { z } from "zod";
import { BilingualPublicTextSchema } from "../domain/agentOutputsShared";
import { WorkflowActorIdSchema } from "../domain/roleRegistry";

export const WORKFLOW_PUBLIC_EVENT_KINDS = [
  "run_created",
  "collection_started",
  "evidence_cutoff_recorded",
  "snapshot_sealed",
  "mandate_sealed",
  "specialist_memo_committed",
  "department_consolidation_committed",
  "challenge_committed",
  "followup_committed",
  "owner_response_committed",
  "department_ballot_committed",
  "structural_audit_completed",
  "semantic_audit_committed",
  "gathering_started",
  "committee_classified",
  "chair_synthesis_committed",
  "runtime_status",
  "report_published",
  "run_incomplete",
  "run_failed",
  "run_cancelling",
  "run_cancelled",
] as const;

export type WorkflowPublicEventKind =
  (typeof WORKFLOW_PUBLIC_EVENT_KINDS)[number];
export type WorkflowPublicEventAuthority =
  | "system"
  | "trusted_artifact_commit"
  | "atomic_report_publication";

const UuidSchema = z.string().uuid();
const PublicIdsSchema = z.array(z.string().min(1).max(160)).max(256).readonly();
const PublicEventFieldsSchema = z
  .object({
    eventId: UuidSchema,
    runId: UuidSchema,
    snapshotId: UuidSchema,
    sequence: z.number().int().positive(),
    kind: z.enum(WORKFLOW_PUBLIC_EVENT_KINDS),
    occurredAt: z.string().datetime(),
    actorId: WorkflowActorIdSchema.optional(),
    participantIds: z.array(WorkflowActorIdSchema).max(12).readonly(),
    artifactId: UuidSchema.optional(),
    logicalArtifactId: z.string().min(1).max(160).optional(),
    reportId: UuidSchema.optional(),
    reportVersionId: UuidSchema.optional(),
    claimIds: z.array(UuidSchema).max(256).readonly(),
    sourceIds: z.array(UuidSchema).max(256).readonly(),
    limitationIds: PublicIdsSchema,
    summary: BilingualPublicTextSchema,
  })
  .strict();

export const WorkflowPublicEventSchema = PublicEventFieldsSchema.extend({
  schemaVersion: z.literal("workflow-v1"),
  phase: z.enum([
    "initialization",
    "evidence_collection",
    "department_review",
    "challenge",
    "audit",
    "committee",
    "synthesis",
    "publication",
    "terminal",
  ]),
  bubbleEligible: z.boolean(),
})
  .strict()
  .readonly();
export type WorkflowPublicEvent = z.infer<typeof WorkflowPublicEventSchema>;
export type WorkflowEventDraft = z.infer<typeof PublicEventFieldsSchema>;

export type PublicEventRejectionReason =
  | "accepted_artifact_required"
  | "actor_ownership_mismatch"
  | "cross_run_event"
  | "duplicate_event"
  | "event_authority_invalid"
  | "event_order_invalid"
  | "event_sequence_invalid"
  | "public_event_invalid";
export type PublicEventAppendResult =
  | { readonly ok: true; readonly event: WorkflowPublicEvent }
  | { readonly ok: false; readonly reason: PublicEventRejectionReason };

export function parseWorkflowEventDraft(
  input: unknown,
): WorkflowEventDraft | undefined {
  return PublicEventFieldsSchema.safeParse(input).data;
}

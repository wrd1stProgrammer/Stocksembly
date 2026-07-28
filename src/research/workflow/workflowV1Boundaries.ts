import {
  ArtifactIdSchema,
  CapabilityIdSchema,
  EventIdSchema,
  ReportIdSchema,
  ReportVersionIdSchema,
  SourceIdSchema,
} from "../domain/ids";
import type {
  WorkflowV1InvalidReason,
  WorkflowV1ReportReadyEntry,
  WorkflowV1State,
} from "./workflowV1Contracts";

export type WorkflowReportIdentity = {
  readonly reportId: string;
  readonly reportVersionId: string;
  readonly reportArtifactId: string;
  readonly chairArtifactId: string;
};

export function invalidWorkflowV1State(
  reason: WorkflowV1InvalidReason,
  sequence: number,
): Extract<WorkflowV1State, { readonly kind: "invalid" }> {
  return { kind: "invalid", reason, sequence };
}

export function isValidWorkflowIntentId(intentId: string): boolean {
  return EventIdSchema.safeParse(intentId).success;
}

type SourceIdentity = {
  readonly sourceId: string;
  readonly artifactId: string;
  readonly capabilityId: string;
};

function isValidSourceIdentity(identity: SourceIdentity): boolean {
  return (
    SourceIdSchema.safeParse(identity.sourceId).success &&
    ArtifactIdSchema.safeParse(identity.artifactId).success &&
    CapabilityIdSchema.safeParse(identity.capabilityId).success
  );
}

export function admitWorkflowSource(
  identity: SourceIdentity,
  accepted: {
    readonly sourceIds: Set<string>;
    readonly artifactIds: Set<string>;
  },
  limit: number,
): WorkflowV1InvalidReason | null {
  if (!isValidSourceIdentity(identity)) return "source_identity_invalid";
  if (
    accepted.sourceIds.has(identity.sourceId) ||
    accepted.artifactIds.has(identity.artifactId)
  )
    return "source_identity_repeated";
  if (accepted.sourceIds.size >= limit) return "source_limit_exceeded";
  accepted.sourceIds.add(identity.sourceId);
  accepted.artifactIds.add(identity.artifactId);
  return null;
}

export function isValidReportIdentity(
  identity: WorkflowReportIdentity,
): boolean {
  return (
    ReportIdSchema.safeParse(identity.reportId).success &&
    ReportVersionIdSchema.safeParse(identity.reportVersionId).success &&
    ArtifactIdSchema.safeParse(identity.reportArtifactId).success &&
    ArtifactIdSchema.safeParse(identity.chairArtifactId).success
  );
}

export function reportIdentitiesMatch(
  left: WorkflowReportIdentity,
  right: WorkflowReportIdentity,
): boolean {
  return (
    left.reportId === right.reportId &&
    left.reportVersionId === right.reportVersionId &&
    left.reportArtifactId === right.reportArtifactId &&
    left.chairArtifactId === right.chairArtifactId
  );
}

export function isAcceptableReportReadiness(
  event: WorkflowV1ReportReadyEntry,
  current: WorkflowV1ReportReadyEntry | null,
  acceptedChairArtifactId: string | undefined,
): boolean {
  return (
    current === null &&
    event.chairArtifactId === acceptedChairArtifactId &&
    isValidReportIdentity(event)
  );
}

export function isMatchingReportPublication(
  event: WorkflowReportIdentity,
  ready: WorkflowV1ReportReadyEntry | null,
): boolean {
  return (
    ready !== null &&
    reportIdentitiesMatch(event, ready) &&
    isValidReportIdentity(event)
  );
}

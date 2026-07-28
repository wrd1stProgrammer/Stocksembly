import { z } from "zod";
import {
  ArtifactIdSchema,
  EventIdSchema,
  ReportIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "./ids";
import { PublicationStatusSchema } from "./report";
import {
  type AcceptedArtifactProvenance,
  AcceptedArtifactProvenanceSchema,
} from "./reportArtifactProvenance";

const EventTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => !/https?:\/\//i.test(value), {
    message: "raw URLs are forbidden in public events",
  });
const LocalizedEventTextSchema = z
  .object({ en: EventTextSchema, ko: EventTextSchema })
  .strict();

export const PUBLIC_RESEARCH_EVENT_KINDS = [
  "artifact_committed",
  "report_published",
  "question_answered",
  "state_committed",
] as const;

export const PublicResearchEventSchema = z
  .object({
    schemaVersion: z.literal("workflow-v1"),
    eventId: EventIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    sequence: z.number().int().positive(),
    kind: z.enum(PUBLIC_RESEARCH_EVENT_KINDS),
    artifactId: ArtifactIdSchema,
    actorId: z.string().min(1).max(80),
    stage: z.enum(["memo", "chair_synthesis"]),
    artifact: AcceptedArtifactProvenanceSchema,
    participantIds: z.array(z.string().min(1).max(80)).optional(),
    claimIds: z.array(z.string().uuid()).optional(),
    sourceIds: z.array(z.string().uuid()).optional(),
    limitationIds: z.array(z.string().min(1).max(100)).optional(),
    summary: LocalizedEventTextSchema,
    detail: LocalizedEventTextSchema,
    stateId: z.string().min(1).max(100),
    occurredAt: z.string().datetime(),
  })
  .strict()
  .superRefine((event, context) => {
    if (
      event.artifactId !== event.artifact.artifactId ||
      event.actorId !== event.artifact.roleId ||
      event.stage !== event.artifact.stage ||
      event.runId !== event.artifact.runId ||
      event.snapshotId !== event.artifact.snapshotId
    )
      context.addIssue({
        code: "custom",
        path: ["artifact"],
        message: "event must match its accepted artifact provenance",
      });
  });
export type PublicResearchEvent = z.infer<typeof PublicResearchEventSchema>;

export type PublicEventArtifactValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: "accepted_artifact_not_found" };

export function validatePublicEventArtifact(
  eventInput: unknown,
  acceptedInput: unknown,
): PublicEventArtifactValidation {
  const event = PublicResearchEventSchema.parse(eventInput);
  const accepted = z
    .array(AcceptedArtifactProvenanceSchema)
    .parse(acceptedInput);
  const found = accepted.some(
    (artifact: AcceptedArtifactProvenance) =>
      artifact.artifactId === event.artifact.artifactId &&
      artifact.logicalArtifactId === event.artifact.logicalArtifactId &&
      artifact.roleId === event.artifact.roleId &&
      artifact.stage === event.artifact.stage &&
      artifact.runId === event.runId &&
      artifact.snapshotId === event.snapshotId,
  );
  return found
    ? { valid: true }
    : { valid: false, reason: "accepted_artifact_not_found" };
}

export const ReportVersionSummarySchema = z
  .object({
    reportId: ReportIdSchema,
    versionId: ReportVersionIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    version: z.number().int().positive(),
    status: PublicationStatusSchema,
    publishedAt: z.string().datetime(),
    title: LocalizedEventTextSchema,
  })
  .strict();
export type ReportVersionSummary = z.infer<typeof ReportVersionSummarySchema>;

export const ReportHistorySchema = z
  .object({
    reportId: ReportIdSchema,
    currentVersionId: ReportVersionIdSchema,
    versions: z.array(ReportVersionSummarySchema).min(1),
  })
  .strict()
  .superRefine((history, context) => {
    const ordered = [...history.versions].sort(
      (left, right) => left.version - right.version,
    );
    if (
      ordered.some(
        (version, index) =>
          version.reportId !== history.reportId ||
          version.version !== index + 1,
      )
    )
      context.addIssue({
        code: "custom",
        path: ["versions"],
        message: "report/version lineage is invalid",
      });
    const current = ordered.at(-1);
    if (current?.versionId !== history.currentVersionId)
      context.addIssue({
        code: "custom",
        path: ["currentVersionId"],
        message: "current version must be latest",
      });
  });
export type ReportHistory = z.infer<typeof ReportHistorySchema>;

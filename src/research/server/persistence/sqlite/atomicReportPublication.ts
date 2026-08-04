import Database from "better-sqlite3";
import { z } from "zod";
import type { AuthoritativeReportCommit } from "../../../application/assembleReportPersistence";
import type { AcceptedChairFence } from "../../../application/authoritativeReportPublisherContracts";
import {
  ArtifactIdSchema,
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  ReportIdSchema,
  ReportVersionIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { REQUIRED_REPORT_ARTIFACT_ROLES } from "../../../domain/reportArtifactProvenance";
import { serializeSafeJson } from "./safeJson";
import {
  evaluatePrePublicationEditorialGate,
  type PrePublicationEditorialEnvelope,
} from "../../../workflow/prePublicationEditorialGate";

const REPORT_PARENT_COUNT = REQUIRED_REPORT_ARTIFACT_ROLES.length + 2;

const ChairFenceRowSchema = z.object({
  artifact_id: z.string(),
  run_id: z.string(),
  snapshot_id: z.string(),
  job_id: z.string(),
  attempt_id: z.string(),
  ordinal: z.number().int().positive(),
  owner_id: z.string(),
  fence_token: z.number().int().positive(),
  logical_artifact_key: z.literal("chair_synthesis:chair"),
});
const RunRowSchema = z.object({
  snapshot_id: z.string(),
  status: z.literal("running"),
  version: z.number().int().nonnegative(),
  report_id: z.null(),
});
const ParentRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
});
const SequenceSchema = z.object({ sequence: z.number().int().positive() });
const PublicationIdentitySchema = z.object({
  runId: RunIdSchema,
  acceptedChairArtifactId: ArtifactIdSchema,
  expectedRunVersion: z.number().int().nonnegative(),
  eventId: EventIdSchema,
  fence: z.object({
    jobId: JobIdSchema,
    attemptId: AttemptIdSchema,
    ordinal: z.number().int().positive(),
    ownerId: z.string().min(1),
    token: z.number().int().positive(),
  }),
  descriptor: z.object({
    artifactId: ArtifactIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
  }),
  version: z.object({
    reportId: ReportIdSchema,
    versionId: ReportVersionIdSchema,
    runId: RunIdSchema,
    snapshotId: SnapshotIdSchema,
    artifactId: ArtifactIdSchema,
  }),
  parentArtifactIds: z
    .array(ArtifactIdSchema)
    .length(REPORT_PARENT_COUNT)
    .refine((ids) => new Set(ids).size === REPORT_PARENT_COUNT),
});

export type AtomicPublicationInput = {
  readonly runId: string;
  readonly acceptedChairArtifactId: string;
  readonly fence: AcceptedChairFence;
  readonly expectedRunVersion: number;
  readonly eventId: string;
  readonly commit: AuthoritativeReportCommit;
};

export function publishReportAtomically(
  databasePath: string,
  input: AtomicPublicationInput,
): number {
  const database = new Database(databasePath, { timeout: 5_000 });
  database.pragma("foreign_keys = ON");
  try {
    const publicPayload = input.commit.version.publicPayload as Record<string, unknown>;
    if (publicPayload["schemaVersion"] === "workflow-v2") {
      const envelope = publicPayload["editorialPublication"] as
        | PrePublicationEditorialEnvelope
        | undefined;
      if (
        envelope?.gateVersion !== "editorial-quality-v1" ||
        envelope.qaPolicy.moduleMinimum !== 5 ||
        envelope.qaPolicy.standardTarget !== 10 ||
        envelope.qaPolicy.supportedCount !==
          envelope.candidate.anticipatedQuestions.length ||
        envelope.qaPolicy.moduleVisible !==
          (envelope.qaPolicy.supportedCount >= envelope.qaPolicy.moduleMinimum)
      )
        throw new TypeError("editorial_quality_failed:missing_prepublication_artifact");
      const quality = evaluatePrePublicationEditorialGate(envelope.candidate);
      if (!quality.publishable) {
        const first = quality.hardViolations[0];
        throw new TypeError(
          `editorial_quality_failed:${first?.code ?? "unknown"}:${first?.path ?? "unknown"}`,
        );
      }
    }
    return database
      .transaction(() => {
        const identity = PublicationIdentitySchema.parse({
          runId: input.runId,
          acceptedChairArtifactId: input.acceptedChairArtifactId,
          expectedRunVersion: input.expectedRunVersion,
          eventId: input.eventId,
          fence: input.fence,
          descriptor: input.commit.descriptor,
          version: input.commit.version,
          parentArtifactIds: input.commit.parentArtifactIds,
        });
        const chair = ChairFenceRowSchema.parse(
          database
            .prepare(`SELECT agent_output_commits.artifact_id,
          attempts.run_id, attempts.snapshot_id, attempts.job_id,
          attempts.attempt_id, agent_output_commits.ordinal,
          agent_output_commits.owner_id, agent_output_commits.fence_token,
          attempts.logical_artifact_key
          FROM agent_output_commits JOIN attempts USING(attempt_id)
          WHERE agent_output_commits.artifact_id = ?`)
            .get(identity.acceptedChairArtifactId),
        );
        if (
          chair.run_id !== identity.runId ||
          chair.snapshot_id !== identity.descriptor.snapshotId ||
          chair.job_id !== identity.fence.jobId ||
          chair.attempt_id !== identity.fence.attemptId ||
          chair.ordinal !== identity.fence.ordinal ||
          chair.owner_id !== identity.fence.ownerId ||
          chair.fence_token !== identity.fence.token
        )
          throw new TypeError("accepted chair fence mismatch");
        const run = RunRowSchema.parse(
          database
            .prepare(`SELECT snapshot_id, status, version, report_id
          FROM runs WHERE run_id = ?`)
            .get(identity.runId),
        );
        if (
          run.version !== identity.expectedRunVersion ||
          run.snapshot_id !== identity.descriptor.snapshotId ||
          identity.descriptor.runId !== identity.runId ||
          identity.version.runId !== identity.runId ||
          identity.version.snapshotId !== run.snapshot_id ||
          identity.version.artifactId !== identity.descriptor.artifactId
        )
          throw new TypeError("run publication fence mismatch");
        const parentRows = database
          .prepare(`SELECT artifact_id, run_id, snapshot_id FROM artifacts
          WHERE artifact_id IN (${identity.parentArtifactIds.map(() => "?").join(",")})`)
          .all(...identity.parentArtifactIds)
          .map((row) => ParentRowSchema.parse(row));
        if (
          parentRows.length !== REPORT_PARENT_COUNT ||
          parentRows.some(
            (parent) =>
              parent.run_id !== identity.runId ||
              parent.snapshot_id !== run.snapshot_id,
          )
        )
          throw new TypeError("report parent lineage mismatch");
        database
          .prepare(`INSERT INTO artifacts(artifact_id, run_id, snapshot_id,
        content_hash, byte_length, media_type, logical_key, input_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            identity.descriptor.artifactId,
            identity.descriptor.runId,
            identity.descriptor.snapshotId,
            input.commit.descriptor.digest,
            input.commit.descriptor.byteLength,
            input.commit.descriptor.mediaType,
            `report_version:${identity.version.versionId}`,
            input.commit.descriptor.digest,
            input.commit.version.publishedAt,
          );
        const edge = database.prepare(`INSERT INTO artifact_edges(
        child_artifact_id, parent_artifact_id, relation) VALUES (?, ?, 'derived-from')`);
        for (const parentId of identity.parentArtifactIds)
          edge.run(identity.descriptor.artifactId, parentId);
        database
          .prepare(`INSERT INTO reports(report_id, run_id, snapshot_id,
        state, created_at) VALUES (?, ?, ?, 'draft', ?)`)
          .run(
            identity.version.reportId,
            identity.runId,
            run.snapshot_id,
            input.commit.version.publishedAt,
          );
        database
          .prepare(`INSERT INTO report_versions(version_id, report_id,
        run_id, snapshot_id, version, artifact_id, status, published_at,
        public_payload_json) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`)
          .run(
            identity.version.versionId,
            identity.version.reportId,
            identity.runId,
            run.snapshot_id,
            identity.descriptor.artifactId,
            input.commit.version.status,
            input.commit.version.publishedAt,
            serializeSafeJson(input.commit.version.publicPayload),
          );
        database
          .prepare("UPDATE reports SET state = 'published' WHERE report_id = ?")
          .run(identity.version.reportId);
        const terminalStatus =
          input.commit.version.status === "complete"
            ? "completed"
            : "complete-with-limitations";
        const changed = database
          .prepare(`UPDATE runs SET status = ?,
        report_id = ?, report_published_at = ?, version = version + 1,
        last_event_seq = last_event_seq + 1 WHERE run_id = ? AND status = 'running'
        AND version = ? AND report_id IS NULL`)
          .run(
            terminalStatus,
            identity.version.reportId,
            input.commit.version.publishedAt,
            identity.runId,
            identity.expectedRunVersion,
          );
        if (changed.changes !== 1)
          throw new TypeError("run publication conflict");
        const sequence = SequenceSchema.parse(
          database
            .prepare(
              "SELECT last_event_seq AS sequence FROM runs WHERE run_id = ?",
            )
            .get(identity.runId),
        ).sequence;
        database
          .prepare(`INSERT INTO run_events(run_id, sequence, event_id,
        event_type, state_id, occurred_at, payload_json) VALUES (
        ?, ?, ?, 'report_published', 'report-published', ?, ?)`)
          .run(
            identity.runId,
            sequence,
            identity.eventId,
            input.commit.version.publishedAt,
            serializeSafeJson({
              schemaVersion: input.commit.version.publicPayload.schemaVersion,
              reportId: identity.version.reportId,
              reportVersionId: identity.version.versionId,
              artifactId: identity.descriptor.artifactId,
              participantIds: [],
              summary: {
                en: "Research report published.",
                ko: "리서치 보고서가 발행됐습니다.",
              },
              claimIds: input.commit.version.publicPayload.claimIds,
              sourceIds: input.commit.version.publicPayload.sourceIds,
              limitationIds: input.commit.version.publicPayload.limitationIds,
            }),
          );
        return 1;
      })
      .immediate();
  } finally {
    database.close();
  }
}

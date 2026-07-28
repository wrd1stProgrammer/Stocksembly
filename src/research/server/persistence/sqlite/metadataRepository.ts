import type Database from "better-sqlite3";
import { z } from "zod";
import { IdempotencyConflictError, StateConflictError } from "./errors";
import { parseSafeJson, serializeSafeJson } from "./safeJson";
import type {
  ArtifactEdgeInput,
  ArtifactMetadataInput,
  BindJobInputArtifact,
  CreateQuestionInput,
  IdempotencyInput,
  IdempotencyResult,
  SaveReportVersionInput,
} from "./types";

const VersionRowSchema = z.object({
  version: z.number().int().nonnegative(),
  version_id: z.string().nullable().optional(),
});
const IdempotencyRowSchema = z.object({
  request_hash: z.string(),
  result_json: z.string(),
});
const ArtifactIdentityRowSchema = z.object({
  artifact_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
});

export function findArtifactByContentHash(
  database: Database.Database,
  contentHash: string,
  snapshotId: string,
): { readonly artifactId: string; readonly snapshotId: string } | undefined {
  const row = database
    .prepare(
      `SELECT artifact_id, snapshot_id FROM artifacts
      WHERE content_hash = ? AND snapshot_id = ?`,
    )
    .get(contentHash, snapshotId);
  if (row === undefined) return undefined;
  const parsed = ArtifactIdentityRowSchema.parse(row);
  return {
    artifactId: parsed.artifact_id,
    snapshotId: parsed.snapshot_id,
  };
}

export function saveArtifactMetadata(
  database: Database.Database,
  input: ArtifactMetadataInput,
): string {
  const existing = findArtifactByContentHash(
    database,
    input.contentHash,
    input.snapshotId,
  );
  if (existing !== undefined) {
    return existing.artifactId;
  }
  database
    .prepare(`INSERT INTO artifacts(
      artifact_id, run_id, snapshot_id, content_hash, byte_length,
      media_type, logical_key, input_hash, created_at
    ) VALUES (
      @artifactId, @runId, @snapshotId, @contentHash, @byteLength,
      @mediaType, @logicalKey, @inputHash, @createdAt
    )`)
    .run(input);
  if (input.locator !== undefined)
    database
      .prepare(`INSERT INTO artifact_citation_metadata(artifact_id, locator_json)
      VALUES (@artifactId, @locatorJson)`)
      .run({
        artifactId: input.artifactId,
        locatorJson: JSON.stringify(input.locator),
      });
  return input.artifactId;
}

export function bindJobInputArtifact(
  database: Database.Database,
  input: BindJobInputArtifact,
): void {
  database
    .prepare(`INSERT INTO job_input_artifacts(job_id, artifact_id)
    VALUES (@jobId, @artifactId)`)
    .run(input);
}

export function addArtifactEdge(
  database: Database.Database,
  input: ArtifactEdgeInput,
): void {
  database
    .prepare(`INSERT INTO artifact_edges(
      child_artifact_id, parent_artifact_id, relation
    ) VALUES (@childArtifactId, @parentArtifactId, @relation)`)
    .run(input);
}

export function saveReportVersion(
  database: Database.Database,
  input: SaveReportVersionInput,
): number {
  return database
    .transaction(() => {
      database
        .prepare(`INSERT INTO reports(report_id, run_id, snapshot_id, state, created_at)
        VALUES (@reportId, @runId, @snapshotId, 'draft', @publishedAt)
        ON CONFLICT(report_id) DO NOTHING`)
        .run(input);
      const existing = database
        .prepare("SELECT run_id, snapshot_id FROM reports WHERE report_id = ?")
        .get(input.reportId);
      const lineage = z
        .object({ run_id: z.string(), snapshot_id: z.string() })
        .parse(existing);
      if (
        lineage.run_id !== input.runId ||
        lineage.snapshot_id !== input.snapshotId
      )
        throw new StateConflictError(input.reportId, "report lineage changed");
      const latest = VersionRowSchema.parse(
        database
          .prepare(`SELECT COALESCE(MAX(version), 0) AS version,
            (SELECT version_id FROM report_versions
              WHERE report_id = ? ORDER BY version DESC LIMIT 1) AS version_id
          FROM report_versions WHERE report_id = ?`)
          .get(input.reportId, input.reportId),
      );
      const version = latest.version + 1;
      if (
        (input.expectedVersion !== undefined &&
          input.expectedVersion !== version) ||
        (input.priorVersionId !== undefined &&
          input.priorVersionId !== (latest.version_id ?? null))
      )
        throw new StateConflictError(
          input.reportId,
          "report version lineage changed",
        );
      database
        .prepare(`INSERT INTO report_versions(
        version_id, report_id, run_id, snapshot_id, version, artifact_id,
        status, published_at, public_payload_json
      ) VALUES (
        @versionId, @reportId, @runId, @snapshotId, @version, @artifactId,
        @status, @publishedAt, @publicPayloadJson
      )`)
        .run({
          ...input,
          version,
          publicPayloadJson: serializeSafeJson(input.publicPayload),
        });
      database
        .prepare("UPDATE reports SET state = 'published' WHERE report_id = ?")
        .run(input.reportId);
      return version;
    })
    .immediate();
}

export function createQuestion(
  database: Database.Database,
  input: CreateQuestionInput,
): number {
  return database
    .transaction(() => {
      const latest = VersionRowSchema.parse(
        database
          .prepare(`SELECT COALESCE(MAX(attempt_ordinal), 0) AS version
          FROM questions WHERE report_id = ?`)
          .get(input.reportId),
      ).version;
      const attemptOrdinal = latest + 1;
      if (attemptOrdinal > 20)
        throw new StateConflictError(
          input.reportId,
          "question replacement limit exhausted",
        );
      database
        .prepare(`INSERT INTO questions(
        question_id, retry_of_question_id, report_id, report_version_id,
        run_id, snapshot_id, job_id, attempt_ordinal, status,
        question_json, created_at
      ) VALUES (
        @questionId, @retryOfQuestionId, @reportId, @reportVersionId,
        @runId, @snapshotId, @jobId, @attemptOrdinal, 'pending',
        @questionJson, @createdAt
      )`)
        .run({
          ...input,
          retryOfQuestionId: input.retryOfQuestionId ?? null,
          attemptOrdinal,
          questionJson: serializeSafeJson(input.question),
        });
      return attemptOrdinal;
    })
    .immediate();
}

export function claimIdempotency(
  database: Database.Database,
  input: IdempotencyInput,
): IdempotencyResult {
  const resultJson = serializeSafeJson(input.result);
  return database
    .transaction((): IdempotencyResult => {
      const value = database
        .prepare(`SELECT request_hash, result_json FROM idempotency_records
        WHERE scope = @scope AND idempotency_key = @key`)
        .get(input);
      if (value !== undefined) {
        const row = IdempotencyRowSchema.parse(value);
        if (row.request_hash !== input.requestHash)
          throw new IdempotencyConflictError(input.scope, input.key);
        return { kind: "replayed", result: parseSafeJson(row.result_json) };
      }
      database
        .prepare(`INSERT INTO idempotency_records(
        scope, idempotency_key, request_hash, result_json, created_at
      ) VALUES (@scope, @key, @requestHash, @resultJson, @createdAt)`)
        .run({ ...input, resultJson });
      return { kind: "created", result: input.result };
    })
    .immediate();
}

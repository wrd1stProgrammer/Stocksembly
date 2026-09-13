import { z } from "zod";
import { type ResearchDatabase, researchTransaction } from "./database";
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
export async function findArtifactByContentHash(
  database: ResearchDatabase,
  contentHash: string,
  snapshotId: string,
): Promise<
  | {
      readonly artifactId: string;
      readonly snapshotId: string;
    }
  | undefined
> {
  const row = (
    await database.query(
      `SELECT artifact_id, snapshot_id FROM research.artifacts
      WHERE content_hash = $1 AND snapshot_id = $2`,
      [contentHash, snapshotId],
    )
  ).rows[0];
  if (row === undefined) return undefined;
  const parsed = ArtifactIdentityRowSchema.parse(row);
  return {
    artifactId: parsed.artifact_id,
    snapshotId: parsed.snapshot_id,
  };
}
export async function saveArtifactMetadata(
  database: ResearchDatabase,
  input: ArtifactMetadataInput,
): Promise<string> {
  return researchTransaction(database, async (database) => {
    const inserted = await database.query(
      `INSERT INTO research.artifacts(artifact_id, run_id, snapshot_id, content_hash, byte_length, media_type, logical_key, input_hash, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING artifact_id`,
      [
        input.artifactId,
        input.runId,
        input.snapshotId,
        input.contentHash,
        input.byteLength,
        input.mediaType,
        input.logicalKey,
        input.inputHash,
        input.createdAt,
      ],
    );
    if (inserted.rowCount === 0) {
      const existing = await findArtifactByContentHash(
        database,
        input.contentHash,
        input.snapshotId,
      );
      if (!existing)
        throw new StateConflictError(
          input.artifactId,
          "artifact vanished after conflict",
        );
      return existing.artifactId;
    }
    if (input.locator !== undefined)
      await database.query(
        `INSERT INTO research.artifact_citation_metadata(artifact_id, locator_json) VALUES ($1,$2)`,
        [input.artifactId, JSON.stringify(input.locator)],
      );
    return input.artifactId;
  });
}
export async function bindJobInputArtifact(
  database: ResearchDatabase,
  input: BindJobInputArtifact,
): Promise<void> {
  await database.query(
    `INSERT INTO research.job_input_artifacts(job_id, artifact_id)
    VALUES ($1, $2)`,
    [input.jobId, input.artifactId],
  );
}
export async function addArtifactEdge(
  database: ResearchDatabase,
  input: ArtifactEdgeInput,
): Promise<void> {
  await database.query(
    `INSERT INTO research.artifact_edges(
      child_artifact_id, parent_artifact_id, relation
    ) VALUES ($1, $2, $3)`,
    [input.childArtifactId, input.parentArtifactId, input.relation],
  );
}
export async function saveReportVersion(
  database: ResearchDatabase,
  input: SaveReportVersionInput,
): Promise<number> {
  return await researchTransaction(database, async (database) => {
    await database.query(
      `INSERT INTO research.reports(report_id, run_id, snapshot_id, state, created_at)
        VALUES ($1, $2, $3, 'draft', $4)
        ON CONFLICT(report_id) DO NOTHING`,
      [input.reportId, input.runId, input.snapshotId, input.publishedAt],
    );
    const existing = (
      await database.query(
        `SELECT run_id, snapshot_id FROM research.reports WHERE report_id = $1 FOR UPDATE`,
        [input.reportId],
      )
    ).rows[0];
    const lineage = z
      .object({ run_id: z.string(), snapshot_id: z.string() })
      .parse(existing);
    if (
      lineage.run_id !== input.runId ||
      lineage.snapshot_id !== input.snapshotId
    )
      throw new StateConflictError(input.reportId, "report lineage changed");
    const latest = VersionRowSchema.parse(
      (
        await database.query(
          `SELECT COALESCE(MAX(version), 0) AS version,
            (SELECT version_id FROM research.report_versions
              WHERE report_id = $1 ORDER BY version DESC LIMIT 1) AS version_id
          FROM research.report_versions WHERE report_id = $2`,
          [input.reportId, input.reportId],
        )
      ).rows[0],
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
    await database.query(
      `INSERT INTO research.report_versions(
        version_id, report_id, run_id, snapshot_id, version, artifact_id,
        status, published_at, public_payload_json
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9
      )`,
      [
        input.versionId,
        input.reportId,
        input.runId,
        input.snapshotId,
        version,
        input.artifactId,
        input.status,
        input.publishedAt,
        serializeSafeJson(input.publicPayload),
      ],
    );
    await database.query(
      `UPDATE research.reports SET state = 'published' WHERE report_id = $1`,
      [input.reportId],
    );
    return version;
  });
}
export async function createQuestion(
  database: ResearchDatabase,
  input: CreateQuestionInput,
): Promise<number> {
  return await researchTransaction(database, async (database) => {
    await database.query(
      "SELECT report_id FROM research.reports WHERE report_id = $1 FOR UPDATE",
      [input.reportId],
    );
    const latest = VersionRowSchema.parse(
      (
        await database.query(
          `SELECT COALESCE(MAX(attempt_ordinal), 0) AS version
          FROM research.questions WHERE report_id = $1`,
          [input.reportId],
        )
      ).rows[0],
    ).version;
    const attemptOrdinal = latest + 1;
    if (attemptOrdinal > 20)
      throw new StateConflictError(
        input.reportId,
        "question replacement limit exhausted",
      );
    await database.query(
      `INSERT INTO research.questions(
        question_id, retry_of_question_id, report_id, report_version_id,
        run_id, snapshot_id, job_id, attempt_ordinal, status,
        question_json, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, 'pending',
        $9, $10
      )`,
      [
        input.questionId,
        input.retryOfQuestionId ?? null,
        input.reportId,
        input.reportVersionId,
        input.runId,
        input.snapshotId,
        input.jobId,
        attemptOrdinal,
        serializeSafeJson(input.question),
        input.createdAt,
      ],
    );
    return attemptOrdinal;
  });
}
export async function claimIdempotency(
  database: ResearchDatabase,
  input: IdempotencyInput,
): Promise<IdempotencyResult> {
  const resultJson = serializeSafeJson(input.result);
  return researchTransaction(database, async (database) => {
    const inserted = await database.query(
      `INSERT INTO research.idempotency_records(scope,idempotency_key,request_hash,result_json,created_at)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (scope,idempotency_key) DO NOTHING RETURNING request_hash`,
      [input.scope, input.key, input.requestHash, resultJson, input.createdAt],
    );
    if (inserted.rowCount === 1)
      return { kind: "created", result: input.result };
    const row = IdempotencyRowSchema.parse(
      (
        await database.query(
          `SELECT request_hash,result_json FROM research.idempotency_records WHERE scope=$1 AND idempotency_key=$2`,
          [input.scope, input.key],
        )
      ).rows[0],
    );
    if (row.request_hash !== input.requestHash)
      throw new IdempotencyConflictError(input.scope, input.key);
    return { kind: "replayed", result: parseSafeJson(row.result_json) };
  });
}

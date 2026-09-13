import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { StructuralAuditInput } from "../application/structuralAuditContracts";
import {
  PersistedStructuralAuditSchema,
  type PersistStructuralAuditResult,
  type StructuralAuditArtifactEnvelope,
  StructuralAuditResultSchema,
} from "../application/structuralAuditPersistenceContracts";
import { canonicalJson } from "../domain/contractHelpers";
import {
  ArtifactIdSchema,
  EventIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { ArtifactDigestSchema } from "../ports/artifacts";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { withResearchTransaction } from "../server/persistence/postgres/database";
import {
  addArtifactEdge,
  saveArtifactMetadata,
} from "../server/persistence/postgres/metadataRepository";
import type { StructuralAuditPersistenceOptions } from "../server/persistence/postgres/persistenceOptions";
import { appendRunEvent } from "../server/persistence/postgres/runRepository";
import { parseSafeJson } from "../server/persistence/postgres/safeJson";

const IdempotencyRowSchema = z.object({
  request_hash: z.string(),
  result_json: z.string(),
});

export async function replayStructuralAudit(
  database: ResearchDatabase,
  runId: string,
  requestHash: string,
): Promise<PersistStructuralAuditResult | undefined> {
  const row = IdempotencyRowSchema.safeParse(
    (
      await database.query(
        `SELECT request_hash, result_json FROM idempotency_records
      WHERE scope = 'structural-audit' AND idempotency_key = $1`,
        [runId],
      )
    ).rows[0],
  );
  if (!row.success) return undefined;
  return row.data.request_hash === requestHash
    ? PersistedStructuralAuditSchema.parse(parseSafeJson(row.data.result_json))
    : { kind: "blocked", reason: "claim_set_immutable" };
}

type WriteInput = {
  readonly database: ResearchDatabase;
  readonly options: StructuralAuditPersistenceOptions;
  readonly input: StructuralAuditInput;
  readonly envelope: StructuralAuditArtifactEnvelope;
  readonly requestHash: string;
  readonly workflowArtifactIds: readonly z.infer<typeof ArtifactIdSchema>[];
};

export async function writeStructuralAudit(
  input: WriteInput,
): Promise<PersistStructuralAuditResult> {
  const result = StructuralAuditResultSchema.parse(input.envelope.result);
  const artifactId = ArtifactIdSchema.parse(randomUUID());
  const bytes = new TextEncoder().encode(canonicalJson(input.envelope));
  const parentIds = [
    ...new Set([
      ...input.input.evidence.map((item) => item.artifactId),
      ...input.workflowArtifactIds,
    ]),
  ];
  const parentRows = (
    await input.database.query(
      `SELECT artifact_id, content_hash FROM artifacts
      WHERE artifact_id = ANY($1)`,
      [parentIds],
    )
  ).rows.map((row) =>
    z
      .object({
        artifact_id: ArtifactIdSchema,
        content_hash: ArtifactDigestSchema,
      })
      .parse(row),
  );
  const descriptor = await input.options.cas.put({
    artifactId,
    runId: RunIdSchema.parse(result.runId),
    snapshotId: SnapshotIdSchema.parse(result.snapshotId),
    mediaType: "application/vnd.stocksembly.structural-audit+json",
    parentDigests: [...new Set(parentRows.map((row) => row.content_hash))],
    bytes,
  });
  const receipt = PersistedStructuralAuditSchema.parse({
    kind: "persisted",
    structuralAuditArtifactId: artifactId,
    structuralAuditContentHash: descriptor.digest,
    auditHash: result.auditHash,
    runId: result.runId,
    snapshotId: result.snapshotId,
    claimSetHash: result.claimSetHash,
    publishable: result.publishable,
  });
  return await withResearchTransaction(input.database, async (transaction) => {
    await transaction.query(
      "SELECT run_id FROM runs WHERE run_id = $1 FOR UPDATE",
      [result.runId],
    );
    const concurrent = await replayStructuralAudit(
      transaction,
      result.runId,
      input.requestHash,
    );
    if (concurrent !== undefined) return concurrent;
    const now = input.options.now?.() ?? new Date().toISOString();
    await saveArtifactMetadata(transaction, {
      artifactId,
      runId: RunIdSchema.parse(result.runId),
      snapshotId: SnapshotIdSchema.parse(result.snapshotId),
      contentHash: descriptor.digest,
      byteLength: descriptor.byteLength,
      mediaType: descriptor.mediaType,
      logicalKey: "structural_audit:system",
      inputHash: input.requestHash,
      createdAt: now,
      locator: {
        kind: "artifact",
        artifactId,
        contentHash: descriptor.digest,
      },
    });
    for (const parent of parentRows)
      await addArtifactEdge(transaction, {
        childArtifactId: artifactId,
        parentArtifactId: parent.artifact_id,
        relation: "audits",
      });
    await appendRunEvent(transaction, {
      runId: RunIdSchema.parse(result.runId),
      event: {
        eventId: EventIdSchema.parse(randomUUID()),
        type: "structural_audit_completed",
        stateId: "structural-audit-completed",
        occurredAt: now,
        payload: {
          schemaVersion: "workflow-v1",
          artifactId,
          logicalArtifactId: "structural_audit:system",
          participantIds: [],
          stage: "structural_audit",
          summary: {
            en: "Required evidence and source links have been verified for the report.",
            ko: "리포트에 필요한 근거와 출처 연결을 확인했습니다.",
          },
          claimIds: result.claims.map((claim) => claim.claimId),
          sourceIds: parentIds,
          limitationIds: result.blockers,
        },
      },
    });
    await transaction.query(
      `INSERT INTO idempotency_records(scope, idempotency_key,
          request_hash, result_json, created_at)
        VALUES ('structural-audit', $1, $2, $3, $4)`,
      [result.runId, input.requestHash, canonicalJson(receipt), now],
    );
    return receipt;
  });
}

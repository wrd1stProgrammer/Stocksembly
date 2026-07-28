import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import type { StructuralAuditInput } from "../application/structuralAuditContracts";
import {
  PersistedStructuralAuditSchema,
  type PersistStructuralAuditResult,
  type StructuralAuditArtifactEnvelope,
  type StructuralAuditPersistenceOptions,
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
import {
  addArtifactEdge,
  saveArtifactMetadata,
} from "../server/persistence/sqlite/metadataRepository";
import { appendRunEvent } from "../server/persistence/sqlite/runRepository";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";

const IdempotencyRowSchema = z.object({
  request_hash: z.string(),
  result_json: z.string(),
});

export function replayStructuralAudit(
  database: Database.Database,
  runId: string,
  requestHash: string,
): PersistStructuralAuditResult | undefined {
  const row = IdempotencyRowSchema.safeParse(
    database
      .prepare(`SELECT request_hash, result_json FROM idempotency_records
      WHERE scope = 'structural-audit' AND idempotency_key = ?`)
      .get(runId),
  );
  if (!row.success) return undefined;
  return row.data.request_hash === requestHash
    ? PersistedStructuralAuditSchema.parse(parseSafeJson(row.data.result_json))
    : { kind: "blocked", reason: "claim_set_immutable" };
}

type WriteInput = {
  readonly database: Database.Database;
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
  const parentRows = input.database
    .prepare(`SELECT artifact_id, content_hash FROM artifacts
      WHERE artifact_id IN (${parentIds.map(() => "?").join(",")})`)
    .all(...parentIds)
    .map((row) =>
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
  return input.database
    .transaction(() => {
      const concurrent = replayStructuralAudit(
        input.database,
        result.runId,
        input.requestHash,
      );
      if (concurrent !== undefined) return concurrent;
      const now = input.options.now?.() ?? new Date().toISOString();
      saveArtifactMetadata(input.database, {
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
        addArtifactEdge(input.database, {
          childArtifactId: artifactId,
          parentArtifactId: parent.artifact_id,
          relation: "audits",
        });
      appendRunEvent(input.database, {
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
              en: "Structural evidence audit completed.",
              ko: "구조적 근거 감사가 완료됐습니다.",
            },
            claimIds: result.claims.map((claim) => claim.claimId),
            sourceIds: parentIds,
            limitationIds: result.blockers,
          },
        },
      });
      input.database
        .prepare(`INSERT INTO idempotency_records(scope, idempotency_key,
          request_hash, result_json, created_at)
        VALUES ('structural-audit', ?, ?, ?, ?)`)
        .run(result.runId, input.requestHash, canonicalJson(receipt), now);
      return receipt;
    })
    .immediate();
}

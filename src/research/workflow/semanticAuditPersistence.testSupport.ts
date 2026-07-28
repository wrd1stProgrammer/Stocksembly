import Database from "better-sqlite3";
import { z } from "zod";
import {
  type StructuralAuditArtifactEnvelope,
  StructuralAuditArtifactEnvelopeSchema,
} from "../application/structuralAuditPersistenceContracts";
import { canonicalJson, hashCanonical } from "../domain/contractHelpers";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import { type ArtifactCasPort, ArtifactDigestSchema } from "../ports/artifacts";

type Context = {
  readonly databasePath: string;
  readonly cas: ArtifactCasPort;
  readonly structuralArtifactId: string;
};

export async function rewriteStructuralEnvelope(
  context: Context,
  transform: (
    envelope: StructuralAuditArtifactEnvelope,
  ) => StructuralAuditArtifactEnvelope,
): Promise<void> {
  const database = new Database(context.databasePath);
  const row = database
    .prepare(
      "SELECT run_id, snapshot_id, content_hash FROM artifacts WHERE artifact_id = ?",
    )
    .get(context.structuralArtifactId);
  const metadata = ArtifactMetadataSchema.parse(row);
  const stored = await context.cas.get(metadata.content_hash);
  if (stored === undefined)
    throw new TypeError("structural fixture CAS is missing");
  const envelope = StructuralAuditArtifactEnvelopeSchema.parse(
    JSON.parse(new TextDecoder().decode(stored.bytes)),
  );
  const bytes = new TextEncoder().encode(canonicalJson(transform(envelope)));
  const descriptor = await context.cas.put({
    artifactId: ArtifactIdSchema.parse(context.structuralArtifactId),
    runId: RunIdSchema.parse(metadata.run_id),
    snapshotId: SnapshotIdSchema.parse(metadata.snapshot_id),
    mediaType: "application/vnd.stocksembly.structural-audit+json",
    parentDigests: stored.descriptor.parentDigests,
    bytes,
  });
  database
    .prepare(
      "UPDATE artifacts SET content_hash = ?, byte_length = ? WHERE artifact_id = ?",
    )
    .run(
      descriptor.digest,
      descriptor.byteLength,
      context.structuralArtifactId,
    );
  database.close();
}

const ArtifactMetadataSchema = z.object({
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: ArtifactDigestSchema,
});

export function resealStructuralResult(
  envelope: StructuralAuditArtifactEnvelope,
  result: Omit<StructuralAuditArtifactEnvelope["result"], "auditHash">,
): StructuralAuditArtifactEnvelope {
  const auditHash = hashCanonical(result);
  return StructuralAuditArtifactEnvelopeSchema.parse({
    ...envelope,
    auditHash,
    result: { ...result, auditHash },
  });
}

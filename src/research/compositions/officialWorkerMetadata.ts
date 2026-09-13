import { z } from "zod";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import {
  type ArtifactDescriptor,
  type ArtifactDigest,
  ArtifactDigestSchema,
} from "../ports/artifacts";
import type { ArtifactMetadataTransactions } from "../server/artifacts/filesystemArtifactStore";
import type { ResearchDatabase } from "../server/persistence/postgres/database";

const ArtifactRowSchema = z.object({
  artifact_id: ArtifactIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  content_hash: ArtifactDigestSchema,
  byte_length: z.number().int().nonnegative(),
  media_type: z.string().min(1),
});
const ParentRowSchema = z.object({ content_hash: ArtifactDigestSchema });

export class CommittedArtifactMetadata implements ArtifactMetadataTransactions {
  readonly #database: ResearchDatabase;
  readonly #pending = new Map<ArtifactDigest, ArtifactDescriptor>();

  constructor(database: ResearchDatabase) {
    this.#database = database;
  }

  async commit(descriptor: ArtifactDescriptor): Promise<void> {
    const existing = z.object({ snapshot_id: SnapshotIdSchema }).safeParse(
      (
        await this.#database.query(
          `SELECT snapshot_id FROM artifacts WHERE content_hash = $1
            ORDER BY created_at DESC LIMIT 1`,
          [descriptor.digest],
        )
      ).rows[0],
    );
    if (
      !this.#pending.has(descriptor.digest) &&
      (!existing.success || existing.data.snapshot_id !== descriptor.snapshotId)
    )
      this.#pending.set(descriptor.digest, descriptor);
    return Promise.resolve();
  }

  async find(digest: ArtifactDigest): Promise<ArtifactDescriptor | undefined> {
    const pending = this.#pending.get(digest);
    if (pending !== undefined) return Promise.resolve(pending);
    const result = (
      await this.#database.query(
        `SELECT artifact_id, run_id, snapshot_id, content_hash,
        byte_length, media_type FROM artifacts WHERE content_hash = $1
        ORDER BY created_at DESC LIMIT 1`,
        [digest],
      )
    ).rows[0];
    if (result === undefined) return Promise.resolve(undefined);
    const row = ArtifactRowSchema.parse(result);
    const parents = (
      await this.#database.query(
        `SELECT parent.content_hash FROM artifact_edges
        JOIN artifacts AS child
          ON child.artifact_id = artifact_edges.child_artifact_id
        JOIN artifacts AS parent
          ON parent.artifact_id = artifact_edges.parent_artifact_id
        WHERE child.artifact_id = $1 ORDER BY parent.content_hash`,
        [row.artifact_id],
      )
    ).rows.map((value) => ParentRowSchema.parse(value).content_hash);
    return Promise.resolve({
      artifactId: row.artifact_id,
      runId: row.run_id,
      snapshotId: row.snapshot_id,
      digest: row.content_hash,
      byteLength: row.byte_length,
      mediaType: row.media_type,
      parentDigests: parents,
    });
  }

  close(): void {
    this.#pending.clear();
  }
}

export function requireCommittedMetadata<
  T extends ArtifactMetadataTransactions,
>(metadata: T | undefined): T {
  if (metadata === undefined)
    throw new TypeError("filesystem CAS metadata is unavailable");
  return metadata;
}

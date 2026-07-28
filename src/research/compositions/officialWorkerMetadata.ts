import Database from "better-sqlite3";
import { z } from "zod";
import { ArtifactIdSchema, RunIdSchema, SnapshotIdSchema } from "../domain/ids";
import {
  type ArtifactDescriptor,
  type ArtifactDigest,
  ArtifactDigestSchema,
} from "../ports/artifacts";
import type { ArtifactMetadataTransactions } from "../server/artifacts/filesystemArtifactStore";

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
  readonly #database: Database.Database;
  readonly #pending = new Map<ArtifactDigest, ArtifactDescriptor>();

  constructor(databasePath: string) {
    this.#database = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
      timeout: 5_000,
    });
    this.#database.pragma("busy_timeout = 5000");
  }

  commit(descriptor: ArtifactDescriptor): Promise<void> {
    const existing = z
      .object({ snapshot_id: SnapshotIdSchema })
      .safeParse(
        this.#database
          .prepare(
            `SELECT snapshot_id FROM artifacts WHERE content_hash = ?
            ORDER BY created_at DESC LIMIT 1`,
          )
          .get(descriptor.digest),
      );
    if (
      !this.#pending.has(descriptor.digest) &&
      (!existing.success || existing.data.snapshot_id !== descriptor.snapshotId)
    )
      this.#pending.set(descriptor.digest, descriptor);
    return Promise.resolve();
  }

  find(digest: ArtifactDigest): Promise<ArtifactDescriptor | undefined> {
    const pending = this.#pending.get(digest);
    if (pending !== undefined) return Promise.resolve(pending);
    const result = this.#database
      .prepare(`SELECT artifact_id, run_id, snapshot_id, content_hash,
        byte_length, media_type FROM artifacts WHERE content_hash = ?
        ORDER BY created_at DESC LIMIT 1`)
      .get(digest);
    if (result === undefined) return Promise.resolve(undefined);
    const row = ArtifactRowSchema.parse(result);
    const parents = this.#database
      .prepare(`SELECT parent.content_hash FROM artifact_edges
        JOIN artifacts AS child
          ON child.artifact_id = artifact_edges.child_artifact_id
        JOIN artifacts AS parent
          ON parent.artifact_id = artifact_edges.parent_artifact_id
        WHERE child.artifact_id = ? ORDER BY parent.content_hash`)
      .all(row.artifact_id)
      .map((value) => ParentRowSchema.parse(value).content_hash);
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
    if (this.#database.open) this.#database.close();
  }
}

export function requireCommittedMetadata<
  T extends ArtifactMetadataTransactions,
>(metadata: T | undefined): T {
  if (metadata === undefined)
    throw new TypeError("filesystem CAS metadata is unavailable");
  return metadata;
}

import { z } from "zod";
import type { ArtifactId, RunId, SnapshotId } from "../domain/ids";

export const ArtifactDigestSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .brand<"ArtifactDigest">();
export type ArtifactDigest = z.infer<typeof ArtifactDigestSchema>;

export type ArtifactDescriptor = {
  readonly artifactId: ArtifactId;
  readonly runId: RunId;
  readonly snapshotId: SnapshotId;
  readonly digest: ArtifactDigest;
  readonly byteLength: number;
  readonly mediaType: string;
  readonly parentDigests: readonly ArtifactDigest[];
};

export type ArtifactWrite = Omit<
  ArtifactDescriptor,
  "digest" | "byteLength"
> & {
  readonly bytes: Uint8Array;
};

export type ArtifactRead = {
  readonly descriptor: ArtifactDescriptor;
  readonly bytes: Uint8Array;
};

export interface ArtifactCasPort {
  readonly put: (artifact: ArtifactWrite) => Promise<ArtifactDescriptor>;
  readonly get: (digest: ArtifactDigest) => Promise<ArtifactRead | undefined>;
  readonly has: (digest: ArtifactDigest) => Promise<boolean>;
}

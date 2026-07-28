import type {
  ArtifactDescriptor,
  ArtifactDigest,
  ArtifactWrite,
} from "../../ports/artifacts";

export const ARTIFACT_STORE_ERROR_CODES = [
  "ARTIFACT_DATA_ROOT_REQUIRED",
  "ARTIFACT_HASH_MISMATCH",
  "ARTIFACT_LOCK_TIMEOUT",
  "ARTIFACT_TOO_LARGE",
  "ARTIFACT_UNSAFE_PATH",
] as const;

export type ArtifactStoreErrorCode =
  (typeof ARTIFACT_STORE_ERROR_CODES)[number];

export class ArtifactStoreError extends Error {
  readonly name = "ArtifactStoreError";

  constructor(
    readonly code: ArtifactStoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export const ARTIFACT_DURABILITY_POINTS = [
  "file-sync",
  "rename",
  "directory-sync",
] as const;

export type ArtifactDurabilityPoint =
  (typeof ARTIFACT_DURABILITY_POINTS)[number];

export interface ArtifactMetadataTransactions {
  readonly commit: (descriptor: ArtifactDescriptor) => Promise<void>;
  readonly find: (
    digest: ArtifactDigest,
  ) => Promise<ArtifactDescriptor | undefined>;
}

export type FilesystemArtifactStoreOptions = {
  readonly dataDirectory: string;
  readonly maxBlobBytes: number;
  readonly metadata: ArtifactMetadataTransactions;
  readonly injectFault?: (point: ArtifactDurabilityPoint) => Promise<void>;
};

export type ArtifactStreamWrite = Omit<ArtifactWrite, "bytes"> & {
  readonly bytes?: undefined;
  readonly chunks: AsyncIterable<Uint8Array>;
};

export type OrphanArtifact = {
  readonly byteLength: number;
  readonly digest: ArtifactDigest;
  readonly relativePath: string;
};

export type TemporaryCleanupOptions = {
  readonly olderThan: Date;
};

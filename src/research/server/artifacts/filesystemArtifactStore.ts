import type {
  ArtifactCasPort,
  ArtifactDescriptor,
  ArtifactDigest,
  ArtifactRead,
  ArtifactWrite,
} from "../../ports/artifacts";
import {
  type InspectedBlob,
  inspectBlob,
  removeIfPresent,
} from "./filesystemArtifactFiles";
import {
  commitStagedBlob,
  quarantineBlob,
  stageArtifactStream,
} from "./filesystemArtifactIo";
import {
  cleanupTemporaryFiles,
  listTemporaryFiles,
} from "./filesystemArtifactMaintenance";
import {
  listPhysicalBlobs,
  prepareArtifactPaths,
  resolveArtifactBlobPath,
  resolveStocksemblyDataDirectory,
} from "./filesystemArtifactPaths";
import {
  type ArtifactDurabilityPoint,
  ArtifactStoreError,
  type ArtifactStreamWrite,
  type FilesystemArtifactStoreOptions,
  type OrphanArtifact,
  type TemporaryCleanupOptions,
} from "./filesystemArtifactStore.types";

const noFault = async (_point: ArtifactDurabilityPoint): Promise<void> => {};

export class FilesystemArtifactStore implements ArtifactCasPort {
  private readonly injectFault: (
    point: ArtifactDurabilityPoint,
  ) => Promise<void>;

  constructor(private readonly options: FilesystemArtifactStoreOptions) {
    if (
      !Number.isSafeInteger(options.maxBlobBytes) ||
      options.maxBlobBytes < 1
    ) {
      throw new ArtifactStoreError(
        "ARTIFACT_TOO_LARGE",
        "maxBlobBytes must be a positive safe integer",
      );
    }
    this.injectFault = options.injectFault ?? noFault;
  }

  async put(artifact: ArtifactWrite): Promise<ArtifactDescriptor> {
    return this.putStream({
      artifactId: artifact.artifactId,
      runId: artifact.runId,
      snapshotId: artifact.snapshotId,
      mediaType: artifact.mediaType,
      parentDigests: artifact.parentDigests,
      chunks: singleChunk(artifact.bytes),
    });
  }

  async putStream(artifact: ArtifactStreamWrite): Promise<ArtifactDescriptor> {
    const paths = await prepareArtifactPaths(this.options.dataDirectory);
    const staged = await stageArtifactStream({
      chunks: artifact.chunks,
      injectFault: this.injectFault,
      maxBlobBytes: this.options.maxBlobBytes,
      paths,
    });
    const descriptor: ArtifactDescriptor = Object.freeze({
      artifactId: artifact.artifactId,
      runId: artifact.runId,
      snapshotId: artifact.snapshotId,
      digest: staged.digest,
      byteLength: staged.byteLength,
      mediaType: artifact.mediaType,
      parentDigests: Object.freeze([...artifact.parentDigests]),
    });
    const finalPath = resolveArtifactBlobPath(
      this.options.dataDirectory,
      staged.digest,
    );
    try {
      await commitStagedBlob({
        finalPath,
        injectFault: this.injectFault,
        paths,
        staged,
      });
    } finally {
      await removeIfPresent(staged.path);
    }
    await this.options.metadata.commit(descriptor);
    return descriptor;
  }

  async get(digest: ArtifactDigest): Promise<ArtifactRead | undefined> {
    const paths = await prepareArtifactPaths(this.options.dataDirectory);
    const path = resolveArtifactBlobPath(this.options.dataDirectory, digest);
    let inspected: InspectedBlob;
    try {
      inspected = await inspectBlob(path, true, this.options.maxBlobBytes);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      if (
        error instanceof ArtifactStoreError &&
        error.code === "ARTIFACT_TOO_LARGE"
      ) {
        await quarantineBlob(paths, digest);
        throw hashMismatch(digest, undefined);
      }
      throw error;
    }
    if (inspected.digest !== digest) {
      await quarantineBlob(paths, digest);
      throw hashMismatch(digest, inspected.digest);
    }
    const descriptor = await this.options.metadata.find(digest);
    if (descriptor === undefined) {
      return undefined;
    }
    if (
      descriptor.digest !== digest ||
      descriptor.byteLength !== inspected.byteLength
    ) {
      await quarantineBlob(paths, digest);
      throw hashMismatch(digest, inspected.digest);
    }
    return { descriptor, bytes: inspected.bytes };
  }

  async has(digest: ArtifactDigest): Promise<boolean> {
    return (await this.get(digest)) !== undefined;
  }

  async scanOrphans(): Promise<readonly OrphanArtifact[]> {
    const paths = await prepareArtifactPaths(this.options.dataDirectory);
    const orphans: OrphanArtifact[] = [];
    for (const blob of await listPhysicalBlobs(paths)) {
      if ((await this.options.metadata.find(blob.digest)) !== undefined) {
        continue;
      }
      let inspected: InspectedBlob;
      try {
        inspected = await inspectBlob(
          blob.path,
          false,
          this.options.maxBlobBytes,
        );
      } catch (error) {
        if (
          error instanceof ArtifactStoreError &&
          error.code === "ARTIFACT_TOO_LARGE"
        ) {
          await quarantineBlob(paths, blob.digest);
          throw hashMismatch(blob.digest, undefined);
        }
        throw error;
      }
      if (inspected.digest !== blob.digest) {
        await quarantineBlob(paths, blob.digest);
        throw hashMismatch(blob.digest, inspected.digest);
      }
      orphans.push({
        byteLength: inspected.byteLength,
        digest: blob.digest,
        relativePath: blob.relativePath,
      });
    }
    return orphans.sort((left, right) =>
      left.digest.localeCompare(right.digest),
    );
  }

  async listTemporaryFiles(): Promise<readonly string[]> {
    return listTemporaryFiles(
      await prepareArtifactPaths(this.options.dataDirectory),
    );
  }

  async cleanupStaleTemporaryFiles(
    options: TemporaryCleanupOptions,
  ): Promise<number> {
    return cleanupTemporaryFiles(
      await prepareArtifactPaths(this.options.dataDirectory),
      options.olderThan,
    );
  }
}

export function createFilesystemArtifactStore(
  options: FilesystemArtifactStoreOptions,
): FilesystemArtifactStore {
  return new FilesystemArtifactStore(options);
}

async function* singleChunk(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

function hashMismatch(
  expected: ArtifactDigest,
  actual: ArtifactDigest | undefined,
): ArtifactStoreError {
  return new ArtifactStoreError(
    "ARTIFACT_HASH_MISMATCH",
    `artifact hash mismatch: expected ${expected}, received ${actual ?? "unavailable"}`,
  );
}

export type {
  ArtifactDurabilityPoint,
  ArtifactMetadataTransactions,
  ArtifactStreamWrite,
  FilesystemArtifactStoreOptions,
  OrphanArtifact,
  TemporaryCleanupOptions,
} from "./filesystemArtifactStore.types";
export {
  ArtifactStoreError,
  resolveArtifactBlobPath,
  resolveStocksemblyDataDirectory,
};

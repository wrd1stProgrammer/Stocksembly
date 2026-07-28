import { createHash, randomBytes } from "node:crypto";
import { constants, link, open, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ArtifactDigest } from "../../ports/artifacts";
import { ArtifactDigestSchema } from "../../ports/artifacts";
import {
  acquireArtifactLock,
  assertPrivateBlob,
  BLOB_MODE,
  inspectBlob,
  pathExists,
  removeIfPresent,
  syncDirectory,
  syncFile,
} from "./filesystemArtifactFiles";
import {
  type ArtifactPaths,
  assertRegularFile,
  ensureDigestDirectory,
  hasCode,
  TEMPORARY_PREFIX,
} from "./filesystemArtifactPaths";
import {
  type ArtifactDurabilityPoint,
  ArtifactStoreError,
} from "./filesystemArtifactStore.types";

type FaultInjector = (point: ArtifactDurabilityPoint) => Promise<void>;

export type StagedArtifact = {
  readonly byteLength: number;
  readonly digest: ArtifactDigest;
  readonly path: string;
};

export async function stageArtifactStream(options: {
  readonly chunks: AsyncIterable<Uint8Array>;
  readonly injectFault: FaultInjector;
  readonly maxBlobBytes: number;
  readonly paths: ArtifactPaths;
}): Promise<StagedArtifact> {
  const name = temporaryName();
  const stagingPath = join(options.paths.staging, name);
  const handle = await open(
    stagingPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    BLOB_MODE,
  );
  const hash = createHash("sha256");
  let byteLength = 0;
  try {
    for await (const chunk of options.chunks) {
      const nextLength = byteLength + chunk.byteLength;
      if (nextLength > options.maxBlobBytes) {
        throw new ArtifactStoreError(
          "ARTIFACT_TOO_LARGE",
          `artifact exceeds ${options.maxBlobBytes} bytes`,
        );
      }
      await handle.writeFile(chunk);
      hash.update(chunk);
      byteLength = nextLength;
    }
    await options.injectFault("file-sync");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await removeIfPresent(stagingPath);
    throw error;
  }
  await handle.close();
  const digest = ArtifactDigestSchema.parse(hash.digest("hex"));
  const directory = await ensureDigestDirectory(options.paths, digest);
  const path = join(directory, name);
  try {
    await rename(stagingPath, path);
    const verified = await inspectBlob(path, false, byteLength);
    if (verified.digest !== digest || verified.byteLength !== byteLength) {
      throw hashMismatch(digest, verified.digest);
    }
    return { byteLength, digest, path };
  } catch (error) {
    await removeIfPresent(stagingPath);
    await removeIfPresent(path);
    throw error;
  }
}

export async function commitStagedBlob(options: {
  readonly finalPath: string;
  readonly injectFault: FaultInjector;
  readonly paths: ArtifactPaths;
  readonly staged: StagedArtifact;
}): Promise<void> {
  const lockPath = `${options.finalPath}.lock`;
  const lock = await acquireArtifactLock(lockPath);
  try {
    await options.injectFault("rename");
    try {
      await link(options.staged.path, options.finalPath);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) {
        throw error;
      }
      const existing = await inspectBlob(
        options.finalPath,
        false,
        options.staged.byteLength,
      );
      if (existing.digest !== options.staged.digest) {
        throw hashMismatch(options.staged.digest, existing.digest);
      }
      await syncFile(options.finalPath);
      await removeIfPresent(options.staged.path);
      await options.injectFault("directory-sync");
      await syncDirectory(dirname(options.finalPath));
      return;
    }
    await assertPrivateBlob(options.finalPath);
    await syncFile(options.finalPath);
    await removeIfPresent(options.staged.path);
    await options.injectFault("directory-sync");
    await syncDirectory(dirname(options.finalPath));
  } finally {
    await lock.close();
    await removeIfPresent(lockPath);
  }
}

export async function quarantineBlob(
  paths: ArtifactPaths,
  expected: ArtifactDigest,
): Promise<string | undefined> {
  const source = join(paths.hashes, expected.slice(0, 2), expected.slice(2));
  const lockPath = `${source}.lock`;
  const lock = await acquireArtifactLock(lockPath);
  try {
    if (!(await pathExists(source))) {
      return undefined;
    }
    await assertRegularFile(source);
    const destination = join(
      paths.quarantine,
      `${expected}.${randomBytes(16).toString("hex")}.corrupt`,
    );
    await rename(source, destination);
    await syncDirectory(dirname(source));
    await syncDirectory(paths.quarantine);
    return destination;
  } finally {
    await lock.close();
    await removeIfPresent(lockPath);
  }
}

function temporaryName(): string {
  return `${TEMPORARY_PREFIX}${process.pid}-${randomBytes(16).toString("hex")}`;
}

function hashMismatch(
  expected: ArtifactDigest,
  actual: ArtifactDigest,
): ArtifactStoreError {
  return new ArtifactStoreError(
    "ARTIFACT_HASH_MISMATCH",
    `artifact hash mismatch: expected ${expected}, received ${actual}`,
  );
}

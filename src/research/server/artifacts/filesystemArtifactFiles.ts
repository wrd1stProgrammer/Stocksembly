import { createHash } from "node:crypto";
import {
  constants,
  type FileHandle,
  lstat,
  open,
  unlink,
} from "node:fs/promises";
import { basename } from "node:path";
import type { ArtifactDigest } from "../../ports/artifacts";
import { ArtifactDigestSchema } from "../../ports/artifacts";
import {
  assertRegularFile,
  hasCode,
  isMissing,
} from "./filesystemArtifactPaths";
import { ArtifactStoreError } from "./filesystemArtifactStore.types";

export const BLOB_MODE = 0o600;
const READ_BUFFER_BYTES = 64 * 1024;
const LOCK_ATTEMPTS = 500;

export type InspectedBlob = {
  readonly byteLength: number;
  readonly bytes: Uint8Array;
  readonly digest: ArtifactDigest;
};

export async function inspectBlob(
  path: string,
  collectBytes: boolean,
  maxByteLength = Number.MAX_SAFE_INTEGER,
): Promise<InspectedBlob> {
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (hasCode(error, "ELOOP")) {
      throw unsafePath(path, error);
    }
    throw error;
  }
  const hash = createHash("sha256");
  const chunks: Uint8Array[] = [];
  const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES);
  let byteLength = 0;
  try {
    const status = await handle.stat();
    if (!status.isFile()) {
      throw unsafePath(path);
    }
    if ((status.mode & 0o777) !== BLOB_MODE) {
      throw unsafePath(path);
    }
    if (status.size > maxByteLength) {
      throw new ArtifactStoreError(
        "ARTIFACT_TOO_LARGE",
        `artifact exceeds ${maxByteLength} bytes`,
      );
    }
    while (true) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.byteLength,
        byteLength,
      );
      if (bytesRead === 0) {
        break;
      }
      const chunk = buffer.subarray(0, bytesRead);
      hash.update(chunk);
      if (collectBytes) {
        chunks.push(Uint8Array.from(chunk));
      }
      byteLength += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return {
    byteLength,
    bytes: collectBytes ? Buffer.concat(chunks) : new Uint8Array(),
    digest: ArtifactDigestSchema.parse(hash.digest("hex")),
  };
}

export async function acquireArtifactLock(path: string): Promise<FileHandle> {
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      return await open(
        path,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        BLOB_MODE,
      );
    } catch (error) {
      if (!hasCode(error, "EEXIST")) {
        throw error;
      }
      try {
        const status = await lstat(path);
        if (!status.isFile() || status.isSymbolicLink()) {
          throw unsafePath(path);
        }
      } catch (inspectionError) {
        if (isMissing(inspectionError)) {
          continue;
        }
        throw inspectionError;
      }
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 2));
    }
  }
  throw new ArtifactStoreError(
    "ARTIFACT_LOCK_TIMEOUT",
    `timed out waiting for artifact lock ${basename(path)}`,
  );
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await assertRegularFile(path);
    return true;
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

export async function removeIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
}

export async function syncFile(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function assertPrivateBlob(path: string): Promise<void> {
  await assertRegularFile(path);
  const status = await lstat(path);
  if ((status.mode & 0o777) !== BLOB_MODE) {
    throw unsafePath(path);
  }
}

function unsafePath(path: string, cause?: unknown): ArtifactStoreError {
  return new ArtifactStoreError(
    "ARTIFACT_UNSAFE_PATH",
    `unsafe artifact file: ${path}`,
    cause === undefined ? undefined : { cause },
  );
}

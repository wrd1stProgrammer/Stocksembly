import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { removeIfPresent } from "./filesystemArtifactFiles";
import {
  type ArtifactPaths,
  TEMPORARY_PREFIX,
} from "./filesystemArtifactPaths";
import { ArtifactStoreError } from "./filesystemArtifactStore.types";

const DIGEST_PREFIX = /^[a-f0-9]{2}$/;

export async function listTemporaryFiles(
  paths: ArtifactPaths,
): Promise<readonly string[]> {
  const temporary: string[] = [];
  await collectTemporaryFiles(paths.staging, temporary);
  for (const entry of await readdir(paths.hashes, { withFileTypes: true })) {
    if (!DIGEST_PREFIX.test(entry.name)) {
      continue;
    }
    const directory = join(paths.hashes, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw unsafePath(directory);
    }
    await collectTemporaryFiles(directory, temporary);
  }
  return temporary.sort();
}

export async function cleanupTemporaryFiles(
  paths: ArtifactPaths,
  olderThan: Date,
): Promise<number> {
  const files = await listTemporaryFiles(paths);
  let removed = 0;
  for (const path of files) {
    const status = await lstat(path);
    if (status.mtimeMs < olderThan.getTime()) {
      await removeIfPresent(path);
      removed += 1;
    }
  }
  return removed;
}

async function collectTemporaryFiles(
  directory: string,
  destination: string[],
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.name.startsWith(TEMPORARY_PREFIX)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw unsafePath(path);
    }
    destination.push(path);
  }
}

function unsafePath(path: string): ArtifactStoreError {
  return new ArtifactStoreError(
    "ARTIFACT_UNSAFE_PATH",
    `unsafe temporary artifact path: ${path}`,
  );
}

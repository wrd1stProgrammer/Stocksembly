import { chmod, lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  type ArtifactDigest,
  ArtifactDigestSchema,
} from "../../ports/artifacts";
import { ArtifactStoreError } from "./filesystemArtifactStore.types";

const DIRECTORY_MODE = 0o700;
const DIGEST_PREFIX = /^[a-f0-9]{2}$/;
const DIGEST_SUFFIX = /^[a-f0-9]{62}$/;
export const TEMPORARY_PREFIX = ".artifact-tmp-";

export type ArtifactPaths = {
  readonly root: string;
  readonly artifacts: string;
  readonly hashes: string;
  readonly quarantine: string;
  readonly staging: string;
};

export type PhysicalBlob = {
  readonly digest: ArtifactDigest;
  readonly path: string;
  readonly relativePath: string;
};

export type ArtifactEnvironment = {
  readonly [name: string]: string | undefined;
  readonly HOME?: string;
  readonly STOCKSEMBLY_DATA_DIR?: string;
};

export function resolveStocksemblyDataDirectory(
  environment: ArtifactEnvironment = process.env,
): string {
  const configured = environment.STOCKSEMBLY_DATA_DIR;
  if (configured !== undefined) {
    if (!isAbsolute(configured)) {
      throw new ArtifactStoreError(
        "ARTIFACT_UNSAFE_PATH",
        "STOCKSEMBLY_DATA_DIR must be absolute",
      );
    }
    return resolve(configured);
  }
  const home = environment.HOME;
  if (home === undefined || !isAbsolute(home)) {
    throw new ArtifactStoreError(
      "ARTIFACT_DATA_ROOT_REQUIRED",
      "STOCKSEMBLY_DATA_DIR or an absolute HOME is required",
    );
  }
  return join(
    home,
    "Library",
    "Application Support",
    "Stocksembly",
    "research",
  );
}

export function resolveArtifactBlobPath(
  dataDirectory: string,
  candidate: unknown,
): string {
  const parsed = ArtifactDigestSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ArtifactStoreError(
      "ARTIFACT_UNSAFE_PATH",
      "artifact digest is not a canonical SHA-256 identity",
    );
  }
  return join(
    resolve(dataDirectory),
    "artifacts",
    "sha256",
    parsed.data.slice(0, 2),
    parsed.data.slice(2),
  );
}

export async function prepareArtifactPaths(
  dataDirectory: string,
): Promise<ArtifactPaths> {
  if (!isAbsolute(dataDirectory)) {
    throw new ArtifactStoreError(
      "ARTIFACT_UNSAFE_PATH",
      "artifact data root must be absolute",
    );
  }
  const configuredRoot = resolve(dataDirectory);
  await mkdir(configuredRoot, { recursive: true, mode: DIRECTORY_MODE });
  const configuredStatus = await lstat(configuredRoot);
  if (!configuredStatus.isDirectory() || configuredStatus.isSymbolicLink()) {
    throw new ArtifactStoreError(
      "ARTIFACT_UNSAFE_PATH",
      "artifact data root must be a real directory",
    );
  }
  const root = await realpath(configuredRoot);
  await assertPrivateDirectory(root, root);
  const artifacts = await ensureDirectory(root, root, "artifacts");
  const hashes = await ensureDirectory(root, artifacts, "sha256");
  const quarantine = await ensureDirectory(root, artifacts, "quarantine");
  const staging = await ensureDirectory(root, artifacts, "staging");
  return { root, artifacts, hashes, quarantine, staging };
}

export async function ensureDigestDirectory(
  paths: ArtifactPaths,
  digest: ArtifactDigest,
): Promise<string> {
  return ensureDirectory(paths.root, paths.hashes, digest.slice(0, 2));
}

export async function listPhysicalBlobs(
  paths: ArtifactPaths,
): Promise<readonly PhysicalBlob[]> {
  const blobs: PhysicalBlob[] = [];
  for (const prefix of await readdir(paths.hashes, { withFileTypes: true })) {
    if (!DIGEST_PREFIX.test(prefix.name)) {
      continue;
    }
    const directory = join(paths.hashes, prefix.name);
    if (!prefix.isDirectory() || prefix.isSymbolicLink()) {
      throw unsafePath(directory);
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!DIGEST_SUFFIX.test(entry.name)) {
        continue;
      }
      const path = join(directory, entry.name);
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw unsafePath(path);
      }
      const digest = ArtifactDigestSchema.parse(`${prefix.name}${entry.name}`);
      blobs.push({
        digest,
        path,
        relativePath: relative(paths.root, path).split(sep).join("/"),
      });
    }
  }
  return blobs;
}

export async function assertRegularFile(path: string): Promise<void> {
  const status = await lstat(path);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw unsafePath(path);
  }
}

export function isMissing(error: unknown): boolean {
  return hasCode(error, "ENOENT");
}

export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function containedPath(root: string, parent: string, name: string): string {
  if (
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".."
  ) {
    throw unsafePath(name);
  }
  const candidate = resolve(parent, name);
  const fromRoot = relative(root, candidate);
  if (
    fromRoot === "" ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw unsafePath(candidate);
  }
  return candidate;
}

async function ensureDirectory(
  root: string,
  parent: string,
  name: string,
): Promise<string> {
  const path = containedPath(root, parent, name);
  try {
    await mkdir(path, { mode: DIRECTORY_MODE });
  } catch (error) {
    if (!hasCode(error, "EEXIST")) {
      throw error;
    }
  }
  await assertPrivateDirectory(root, path);
  return path;
}

async function assertPrivateDirectory(
  root: string,
  path: string,
): Promise<void> {
  const fromRoot = relative(root, path);
  if (fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw unsafePath(path);
  }
  const status = await lstat(path);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw unsafePath(path);
  }
  await chmod(path, DIRECTORY_MODE);
}

function unsafePath(path: string): ArtifactStoreError {
  return new ArtifactStoreError(
    "ARTIFACT_UNSAFE_PATH",
    `unsafe artifact path: ${path}`,
  );
}

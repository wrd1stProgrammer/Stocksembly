import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ArtifactIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../domain/ids";
import type {
  ArtifactDescriptor,
  ArtifactDigest,
  ArtifactWrite,
} from "../../ports/artifacts";
import {
  type ArtifactDurabilityPoint,
  createFilesystemArtifactStore,
} from "./filesystemArtifactStore";

const dataDirectories: string[] = [];

export type ArtifactStoreFixtureOptions = {
  readonly failAt?: ArtifactDurabilityPoint;
  readonly injectFault?: (
    point: ArtifactDurabilityPoint,
    dataDirectory: string,
  ) => Promise<void>;
  readonly maxBlobBytes?: number;
};

export class MetadataConflictError extends Error {
  readonly name = "MetadataConflictError";
}

export class MemoryArtifactMetadata {
  readonly commitOrder: string[] = [];
  private readonly byArtifactId = new Map<string, ArtifactDescriptor>();
  private readonly byDigest = new Map<ArtifactDigest, ArtifactDescriptor>();

  readonly commit = async (descriptor: ArtifactDescriptor): Promise<void> => {
    const artifact = this.byArtifactId.get(descriptor.artifactId);
    const digest = this.byDigest.get(descriptor.digest);
    if (
      (artifact !== undefined && !sameDescriptor(artifact, descriptor)) ||
      (digest !== undefined && !sameDescriptor(digest, descriptor))
    ) {
      throw new MetadataConflictError();
    }
    this.byArtifactId.set(descriptor.artifactId, descriptor);
    this.byDigest.set(descriptor.digest, descriptor);
    this.commitOrder.push(descriptor.digest);
  };

  readonly find = async (
    digest: ArtifactDigest,
  ): Promise<ArtifactDescriptor | undefined> => this.byDigest.get(digest);

  forget(digest: ArtifactDigest): void {
    const descriptor = this.byDigest.get(digest);
    this.byDigest.delete(digest);
    if (descriptor !== undefined) {
      this.byArtifactId.delete(descriptor.artifactId);
    }
  }
}

export class InjectedDurabilityError extends Error {
  readonly name = "InjectedDurabilityError";

  constructor(readonly point: string) {
    super(`injected durability failure at ${point}`);
  }
}

export class ArtifactProcessProbeError extends Error {
  readonly name = "ArtifactProcessProbeError";
}

export async function createDataDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "stocksembly-cas-contract-"));
}

export async function createArtifactStoreFixture(
  options: ArtifactStoreFixtureOptions = {},
) {
  const dataDirectory = trackDataDirectory(await createDataDirectory());
  const metadata = new MemoryArtifactMetadata();
  const store = createFilesystemArtifactStore({
    dataDirectory,
    maxBlobBytes: options.maxBlobBytes ?? 1024,
    metadata,
    injectFault: async (point) => {
      await options.injectFault?.(point, dataDirectory);
      if (point === options.failAt) {
        throw new InjectedDurabilityError(point);
      }
    },
  });
  return { dataDirectory, metadata, store };
}

export function trackDataDirectory(dataDirectory: string): string {
  dataDirectories.push(dataDirectory);
  return dataDirectory;
}

export async function cleanupDataDirectories(): Promise<void> {
  await Promise.all(
    dataDirectories
      .splice(0)
      .map((dataDirectory) => rm(dataDirectory, { recursive: true })),
  );
}

export function makeArtifactWrite(
  text: string,
  mediaType = "application/json",
): ArtifactWrite {
  return {
    artifactId: ArtifactIdSchema.parse(randomUUID()),
    runId: RunIdSchema.parse(randomUUID()),
    snapshotId: SnapshotIdSchema.parse(randomUUID()),
    mediaType,
    parentDigests: [],
    bytes: new TextEncoder().encode(text),
  };
}

export async function runArtifactProcessPut(
  dataDirectory: string,
): Promise<void> {
  const vitest = join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
  const worker = join(
    process.cwd(),
    "src",
    "research",
    "server",
    "artifacts",
    "filesystemArtifactStore.process.test.ts",
  );
  const child = spawn(process.execPath, [vitest, "run", worker], {
    env: {
      ...process.env,
      STOCKSEMBLY_CAS_PROCESS_ROOT: dataDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let output = "";
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    output += chunk;
  });
  const exitCode = await new Promise<number | null>(
    (resolveExit, rejectExit) => {
      child.once("error", rejectExit);
      child.once("exit", resolveExit);
    },
  );
  if (exitCode !== 0) {
    throw new ArtifactProcessProbeError(output);
  }
}

function sameDescriptor(
  left: ArtifactDescriptor,
  right: ArtifactDescriptor,
): boolean {
  return (
    left.artifactId === right.artifactId &&
    left.runId === right.runId &&
    left.snapshotId === right.snapshotId &&
    left.digest === right.digest &&
    left.byteLength === right.byteLength &&
    left.mediaType === right.mediaType &&
    left.parentDigests.length === right.parentDigests.length &&
    left.parentDigests.every(
      (digest, index) => digest === right.parentDigests[index],
    )
  );
}

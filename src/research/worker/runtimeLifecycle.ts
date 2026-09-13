import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, open, readFile, rename } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { ArtifactDigestSchema } from "../ports/artifacts";
import {
  ensureDigestDirectory,
  prepareArtifactPaths,
  resolveArtifactBlobPath,
  resolveStocksemblyDataDirectory,
} from "../server/artifacts/filesystemArtifactPaths";
import { PostgresStore } from "../server/persistence/postgres/postgresStore";
import { getResearchPool } from "../server/persistence/postgres/researchPool";

const RUNTIME_MARKER = Buffer.from("stocksembly-worker-runtime-v1\n", "utf8");
const WORKER_LOCK_KEY = 73921401;
export type WorkerRuntime = {
  readonly dataDirectory: string;
  readonly database: Pool;
  readonly migrationsApplied: number;
  readonly casDigest: string;
};
export type WorkerLease = {
  readonly ownerId: string;
  readonly signal: AbortSignal;
  readonly release: () => Promise<void>;
};
export class WorkerRuntimeError extends Error {
  readonly name = "WorkerRuntimeError";
  constructor(
    readonly code:
      | "WORKER_DATA_READ_ONLY"
      | "WORKER_LEASE_OCCUPIED"
      | "WORKER_NOT_RUNNING"
      | "WORKER_RUNTIME_INVALID",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export async function prepareWorkerRuntime(): Promise<WorkerRuntime> {
  const dataDirectory = resolveStocksemblyDataDirectory();
  await assertWritableRoot(dataDirectory);
  const paths = await prepareArtifactPaths(dataDirectory);
  const database = await getResearchPool();
  const store = await PostgresStore.open(database);
  const migrationsApplied = (await store.schemaVersions()).length;
  return {
    dataDirectory: paths.root,
    database,
    migrationsApplied,
    casDigest: await writeRuntimeMarker(paths),
  };
}

export async function acquireWorkerLease(
  runtime: WorkerRuntime,
): Promise<WorkerLease> {
  const client = await runtime.database.connect();
  const controller = new AbortController();
  let released = false;
  const loseLease = (error: Error) => controller.abort(error);
  client.on("error", loseLease);
  try {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [WORKER_LOCK_KEY],
    );
    if (!result.rows[0]?.acquired)
      throw new WorkerRuntimeError(
        "WORKER_LEASE_OCCUPIED",
        "Another research worker holds the PostgreSQL runtime lease",
      );
  } catch (error) {
    client.removeListener("error", loseLease);
    client.release(true);
    throw error;
  }
  // A dedicated session owns the lock; never return it to the pool while active.
  let checking = false;
  const heartbeat = setInterval(() => {
    if (checking || released) return;
    checking = true;
    const deadline = setTimeout(
      () => controller.abort(new Error("WORKER_LEASE_HEARTBEAT_TIMEOUT")),
      5000,
    );
    deadline.unref();
    void client
      .query("SELECT 1")
      .catch((error: unknown) => {
        controller.abort(error);
      })
      .finally(() => {
        clearTimeout(deadline);
        checking = false;
      });
  }, 5000);
  heartbeat.unref();
  return {
    ownerId: `${hostname()}:${process.pid}:${randomUUID()}`,
    signal: controller.signal,
    release: async () => {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      controller.abort();
      client.removeListener("error", loseLease);
      // Closing the session also releases ownership if the connection was lost.
      client.release(true);
    },
  };
}
export async function inspectWorkerHealth(): Promise<WorkerRuntime> {
  const runtime = await prepareWorkerRuntime();
  const client = await runtime.database.connect();
  try {
    const result = await client.query<{ available: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS available",
      [WORKER_LOCK_KEY],
    );
    if (result.rows[0]?.available) {
      await client.query("SELECT pg_advisory_unlock($1)", [WORKER_LOCK_KEY]);
      throw new WorkerRuntimeError(
        "WORKER_NOT_RUNNING",
        "The research worker PostgreSQL lease is not active",
      );
    }
  } finally {
    client.release();
  }
  return runtime;
}

async function assertWritableRoot(path: string): Promise<void> {
  try {
    const status = await lstat(path);
    if (
      !status.isDirectory() ||
      status.isSymbolicLink() ||
      (status.mode & 0o200) === 0
    ) {
      throw new WorkerRuntimeError(
        "WORKER_DATA_READ_ONLY",
        "The research data directory must be a writable real directory",
      );
    }
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    if (error instanceof WorkerRuntimeError) throw error;
    throw new WorkerRuntimeError(
      "WORKER_DATA_READ_ONLY",
      "The research data directory is not writable",
      { cause: error },
    );
  }
}

async function writeRuntimeMarker(
  paths: Awaited<ReturnType<typeof prepareArtifactPaths>>,
): Promise<string> {
  const digest = ArtifactDigestSchema.parse(
    createHash("sha256").update(RUNTIME_MARKER).digest("hex"),
  );
  await ensureDigestDirectory(paths, digest);
  const destination = resolveArtifactBlobPath(paths.root, digest);
  try {
    const existing = await readFile(destination);
    if (!existing.equals(RUNTIME_MARKER)) {
      throw new WorkerRuntimeError(
        "WORKER_RUNTIME_INVALID",
        "The runtime CAS marker does not match its digest",
      );
    }
    return digest;
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
  const temporary = join(paths.staging, `.worker-runtime-${randomUUID()}`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(RUNTIME_MARKER);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, destination);
  await chmod(destination, 0o600);
  return digest;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

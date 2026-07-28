import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ArtifactDigestSchema } from "../ports/artifacts";
import {
  ensureDigestDirectory,
  prepareArtifactPaths,
  resolveArtifactBlobPath,
  resolveStocksemblyDataDirectory,
} from "../server/artifacts/filesystemArtifactPaths";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";

const RUNTIME_MARKER = Buffer.from("stocksembly-worker-runtime-v1\n", "utf8");
const LOCK_FILE = "worker.lock" as const;
const lockSchema = z.object({
  ownerId: z.string().min(1),
  pid: z.number().int().positive(),
  nonce: z.string().uuid(),
});

export type WorkerRuntime = {
  readonly dataDirectory: string;
  readonly databasePath: string;
  readonly migrationsDirectory: string;
  readonly migrationsApplied: number;
  readonly casDigest: string;
};

export type WorkerLease = {
  readonly ownerId: string;
  readonly release: () => Promise<void>;
};

export class WorkerRuntimeError extends Error {
  readonly name = "WorkerRuntimeError";

  constructor(
    readonly code:
      | "MIGRATIONS_UNAVAILABLE"
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
  const migrationsDirectory = await discoverMigrationsDirectory();
  const databasePath = join(paths.root, "research.sqlite");
  let migrationsApplied: number;
  try {
    const store = openSqliteStore(databasePath, { migrationsDirectory });
    migrationsApplied = store.schemaVersions().length;
    store.pragmas();
    store.close();
  } catch (error) {
    throw new WorkerRuntimeError(
      "WORKER_RUNTIME_INVALID",
      "The worker could not open native SQLite or apply migrations",
      { cause: error },
    );
  }
  await chmod(databasePath, 0o600);
  const casDigest = await writeRuntimeMarker(paths);
  return {
    dataDirectory: paths.root,
    databasePath,
    migrationsDirectory,
    migrationsApplied,
    casDigest,
  };
}

export async function acquireWorkerLease(
  runtime: WorkerRuntime,
): Promise<WorkerLease> {
  const path = join(runtime.dataDirectory, LOCK_FILE);
  const record = {
    ownerId: `${hostname()}:${process.pid}`,
    pid: process.pid,
    nonce: randomUUID(),
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return {
        ownerId: record.ownerId,
        release: async () => {
          const current = lockSchema.parse(
            JSON.parse(await readFile(path, "utf8")),
          );
          if (current.nonce === record.nonce) await rm(path);
        },
      };
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      const current = await readLock(path);
      if (processIsAlive(current.pid)) {
        throw new WorkerRuntimeError(
          "WORKER_LEASE_OCCUPIED",
          "Another research worker holds the data-directory lease",
        );
      }
      await rm(path);
    }
  }
  throw new WorkerRuntimeError(
    "WORKER_LEASE_OCCUPIED",
    "Another research worker holds the data-directory lease",
  );
}

export async function inspectWorkerHealth(): Promise<WorkerRuntime> {
  const runtime = await prepareWorkerRuntime();
  const lock = await readLock(join(runtime.dataDirectory, LOCK_FILE));
  if (!processIsAlive(lock.pid)) {
    throw new WorkerRuntimeError(
      "WORKER_NOT_RUNNING",
      "The research worker lease is not active",
    );
  }
  return runtime;
}

async function discoverMigrationsDirectory(): Promise<string> {
  // biome-ignore lint/complexity/useLiteralKeys: ProcessEnv is an index signature.
  const configured = process.env["STOCKSEMBLY_MIGRATIONS_DIR"];
  const entryDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...(configured === undefined ? [] : [configured]),
    resolve(entryDirectory, "../migrations"),
    resolve(process.cwd(), "migrations"),
    resolve(process.cwd(), "src/research/server/persistence/sqlite/migrations"),
  ];
  for (const candidate of candidates) {
    if (!isAbsolute(candidate)) continue;
    try {
      const status = await stat(candidate);
      await access(join(candidate, "001_workflow_core.sql"), constants.R_OK);
      if (status.isDirectory()) return candidate;
    } catch (error) {
      if (!hasCode(error, "ENOENT") && !hasCode(error, "EACCES")) throw error;
    }
  }
  throw new WorkerRuntimeError(
    "MIGRATIONS_UNAVAILABLE",
    "The ordered SQLite migrations directory is unavailable",
  );
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

async function readLock(path: string): Promise<z.infer<typeof lockSchema>> {
  try {
    return lockSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      throw new WorkerRuntimeError(
        "WORKER_NOT_RUNNING",
        "The research worker lease is not active",
      );
    }
    throw new WorkerRuntimeError(
      "WORKER_RUNTIME_INVALID",
      "The research worker lease record is invalid",
      { cause: error },
    );
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasCode(error, "ESRCH")) return false;
    throw error;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

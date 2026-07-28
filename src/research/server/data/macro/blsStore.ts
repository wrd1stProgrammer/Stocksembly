import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { type FileHandle, mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { BlsRequest } from "./blsSchema";

const CacheEntrySchema = z
  .object({
    body: z.string(),
    retrievedAt: z.string().datetime(),
  })
  .strict();

const StoreSchema = z
  .object({
    budget: z.record(z.string(), z.number().int().min(0).max(25)),
    cache: z.record(z.string(), CacheEntrySchema),
  })
  .strict();

type Store = z.infer<typeof StoreSchema>;
export type BlsCacheEntry = z.infer<typeof CacheEntrySchema>;

const EMPTY_STORE: Store = Object.freeze({ budget: {}, cache: {} });
const LOCK_RETRY_MILLISECONDS = 5;
const LOCK_MAX_ATTEMPTS = 400;

export class BlsStoreError extends Error {
  readonly name = "BlsStoreError";

  constructor(
    readonly code: "BLS_STORE_BUSY" | "BLS_STORE_CORRUPT" | "BLS_STORE_UNSAFE",
  ) {
    super(code);
  }
}

function pathFor(dataRoot: string): string {
  return join(dataRoot, "macro", "bls-state.json");
}

function directoryFor(dataRoot: string): string {
  return join(dataRoot, "macro");
}

function lockPathFor(dataRoot: string): string {
  return join(directoryFor(dataRoot), "bls-state.lock");
}

function keyFor(request: BlsRequest): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isExisting(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

async function ensureSafeDirectory(dataRoot: string): Promise<string> {
  const directory = directoryFor(dataRoot);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let handle: FileHandle;
  try {
    handle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (error instanceof Error) throw new BlsStoreError("BLS_STORE_UNSAFE");
    throw error;
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isDirectory()) throw new BlsStoreError("BLS_STORE_UNSAFE");
    await handle.chmod(0o700);
  } finally {
    await handle.close();
  }
  return directory;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function acquireLock(dataRoot: string): Promise<{
  readonly directory: string;
  readonly handle: FileHandle;
  readonly path: string;
}> {
  const directory = await ensureSafeDirectory(dataRoot);
  const path = lockPathFor(dataRoot);
  for (let attempt = 1; attempt <= LOCK_MAX_ATTEMPTS; attempt += 1) {
    let handle: FileHandle;
    try {
      handle = await open(
        path,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if (!isExisting(error)) throw error;
      if (attempt === LOCK_MAX_ATTEMPTS)
        throw new BlsStoreError("BLS_STORE_BUSY");
      await new Promise<void>((resolve) =>
        setTimeout(resolve, LOCK_RETRY_MILLISECONDS),
      );
      continue;
    }
    try {
      await handle.writeFile(`${process.pid}\n`);
      await handle.sync();
      return { directory, handle, path };
    } catch (error) {
      await handle.close();
      await rm(path, { force: true });
      throw error;
    }
  }
  throw new BlsStoreError("BLS_STORE_BUSY");
}

async function withStoreLock<T>(
  dataRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const lock = await acquireLock(dataRoot);
  try {
    return await operation();
  } finally {
    await lock.handle.close();
    await rm(lock.path);
    await syncDirectory(lock.directory);
  }
}

async function readStore(dataRoot: string): Promise<Store> {
  await ensureSafeDirectory(dataRoot);
  let handle: FileHandle;
  try {
    handle = await open(
      pathFor(dataRoot),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (isMissing(error)) return EMPTY_STORE;
    throw error;
  }
  let raw: string;
  try {
    raw = await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new BlsStoreError("BLS_STORE_CORRUPT");
    throw error;
  }
  const parsed = StoreSchema.safeParse(decoded);
  if (!parsed.success) throw new BlsStoreError("BLS_STORE_CORRUPT");
  return parsed.data;
}

async function writeStore(dataRoot: string, store: Store): Promise<void> {
  const directory = await ensureSafeDirectory(dataRoot);
  const destination = pathFor(dataRoot);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      temporary,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(`${JSON.stringify(store)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, destination);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close();
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function readBlsCache(
  dataRoot: string,
  request: BlsRequest,
): Promise<BlsCacheEntry | undefined> {
  return (await readStore(dataRoot)).cache[keyFor(request)];
}

export async function reserveBlsRequest(
  dataRoot: string,
  utcDay: string,
): Promise<boolean> {
  return withStoreLock(dataRoot, async () => {
    const store = await readStore(dataRoot);
    const used = store.budget[utcDay] ?? 0;
    if (used >= 25) return false;
    await writeStore(dataRoot, {
      budget: { ...store.budget, [utcDay]: used + 1 },
      cache: store.cache,
    });
    return true;
  });
}

export async function writeBlsCache(options: {
  readonly dataRoot: string;
  readonly request: BlsRequest;
  readonly body: string;
  readonly retrievedAt: string;
}): Promise<void> {
  await withStoreLock(options.dataRoot, async () => {
    const store = await readStore(options.dataRoot);
    await writeStore(options.dataRoot, {
      budget: store.budget,
      cache: {
        ...store.cache,
        [keyFor(options.request)]: {
          body: options.body,
          retrievedAt: options.retrievedAt,
        },
      },
    });
  });
}

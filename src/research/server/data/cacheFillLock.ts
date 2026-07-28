import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const LOCK_RETRY_MILLISECONDS = 20;
const LOCK_WAIT_MILLISECONDS = 2 * 60_000;
const STALE_LOCK_MILLISECONDS = 5 * 60_000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function lockPath(dataRoot: string, namespace: string, key: string): string {
  const digest = createHash("sha256").update(key).digest("hex");
  return join(dataRoot, "cache", "locks", namespace, `${digest}.lock`);
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function removeStaleLock(path: string, now: number): Promise<void> {
  try {
    const metadata = await stat(path);
    if (now - metadata.mtimeMs > STALE_LOCK_MILLISECONDS) {
      await rm(path, { force: true });
    }
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
  }
}

export async function withCacheFillLock<T>(input: {
  readonly dataRoot: string;
  readonly namespace: string;
  readonly key: string;
  readonly operation: () => Promise<T>;
}): Promise<T> {
  const path = lockPath(input.dataRoot, input.namespace, input.key);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const startedAt = Date.now();
  while (true) {
    let handle;
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
      if (!isCode(error, "EEXIST")) throw error;
      const now = Date.now();
      await removeStaleLock(path, now);
      if (now - startedAt >= LOCK_WAIT_MILLISECONDS)
        throw new Error("CACHE_FILL_LOCK_TIMEOUT");
      await sleep(LOCK_RETRY_MILLISECONDS);
      continue;
    }
    try {
      await handle.writeFile(`${process.pid}\n`);
      await handle.sync();
      return await input.operation();
    } finally {
      await handle.close();
      await rm(path, { force: true });
    }
  }
}

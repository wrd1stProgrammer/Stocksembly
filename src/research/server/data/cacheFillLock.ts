import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile, rm, stat, utimes } from "node:fs/promises";
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

type CacheFillLockPolicy = {
  readonly retryMilliseconds: number;
  readonly waitMilliseconds: number;
  readonly staleMilliseconds: number;
  readonly heartbeatMilliseconds: number;
};

const DEFAULT_POLICY: CacheFillLockPolicy = {
  retryMilliseconds: LOCK_RETRY_MILLISECONDS,
  waitMilliseconds: LOCK_WAIT_MILLISECONDS,
  staleMilliseconds: STALE_LOCK_MILLISECONDS,
  heartbeatMilliseconds: 60_000,
};

async function lockOwner(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

async function removeOwnedLock(path: string, owner: string): Promise<void> {
  if ((await lockOwner(path)) === owner) await rm(path, { force: true });
}

async function removeStaleLock(
  path: string,
  now: number,
  staleMilliseconds: number,
): Promise<void> {
  try {
    const owner = await lockOwner(path);
    if (owner === undefined) return;
    const metadata = await stat(path);
    if (
      now - metadata.mtimeMs > staleMilliseconds &&
      (await lockOwner(path)) === owner
    ) {
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
  readonly policy?: Partial<CacheFillLockPolicy>;
}): Promise<T> {
  const policy = { ...DEFAULT_POLICY, ...input.policy };
  const path = lockPath(input.dataRoot, input.namespace, input.key);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const startedAt = Date.now();
  while (true) {
    let handle: Awaited<ReturnType<typeof open>>;
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
      await removeStaleLock(path, now, policy.staleMilliseconds);
      if (now - startedAt >= policy.waitMilliseconds)
        throw new Error("CACHE_FILL_LOCK_TIMEOUT");
      await sleep(policy.retryMilliseconds);
      continue;
    }
    const owner = `${process.pid}:${randomUUID()}\n`;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      await handle.writeFile(owner);
      await handle.sync();
      heartbeat = setInterval(() => {
        void lockOwner(path)
          .then(async (currentOwner) => {
            if (currentOwner !== owner) return;
            const now = new Date();
            await utimes(path, now, now);
          })
          .catch(() => undefined);
      }, policy.heartbeatMilliseconds);
      heartbeat.unref();
      return await input.operation();
    } finally {
      if (heartbeat !== undefined) clearInterval(heartbeat);
      await handle.close();
      await removeOwnedLock(path, owner);
    }
  }
}

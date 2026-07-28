import { createHash } from "node:crypto";
import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { chmod, link, lstat, mkdir, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { type CodexFailureClass, CodexRunnerError } from "./codexErrors";
import type { VerifiedFile } from "./codexTypes";

const SAFE_PATH = /^\/[A-Za-z0-9._/-]+$/;

type LinkFile = (existingPath: string, newPath: string) => Promise<void>;

type ProtectOriginInput = {
  readonly originPath: string;
  readonly expectedHash: string;
  readonly attemptDir: string;
  readonly beforeLink?: (originHandle: FileHandle) => Promise<void>;
  readonly linkFile?: LinkFile;
};

export type ProtectedOrigin = {
  readonly linkPath: string;
  readonly origin: VerifiedFile;
  readonly link: VerifiedFile;
};

let originProtectionTail: Promise<void> = Promise.resolve();

function assertSafeAbsolutePath(path: string): void {
  if (!isAbsolute(path) || normalize(path) !== path || !SAFE_PATH.test(path))
    throw new CodexRunnerError("policy_violation");
}

async function inspectFileHandle(
  handle: FileHandle,
  failureClass: CodexFailureClass,
  executable = true,
): Promise<VerifiedFile> {
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || (executable && (before.mode & 0o111n) === 0o000n))
      throw new CodexRunnerError(failureClass);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1_024);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.byteLength,
        position,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    buffer.fill(0);
    const after = await handle.stat({ bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mode !== after.mode ||
      before.uid !== after.uid ||
      before.gid !== after.gid ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.size > BigInt(Number.MAX_SAFE_INTEGER)
    )
      throw new CodexRunnerError(failureClass);
    return Object.freeze({
      device: after.dev.toString(),
      inode: after.ino.toString(),
      hash: hash.digest("hex"),
      byteLength: Number(after.size),
      userId: after.uid.toString(),
      groupId: after.gid.toString(),
    });
  } catch (error) {
    if (error instanceof CodexRunnerError) throw error;
    throw new CodexRunnerError(failureClass);
  }
}

async function inspectOpenFile(
  path: string,
  failureClass: CodexFailureClass,
  executable = true,
): Promise<VerifiedFile> {
  const handle = await openNoFollow(path, failureClass);
  try {
    return await inspectFileHandle(handle, failureClass, executable);
  } finally {
    await handle.close();
  }
}

async function openNoFollow(
  path: string,
  failureClass: CodexFailureClass,
): Promise<FileHandle> {
  try {
    return await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new CodexRunnerError(failureClass);
  }
}

export async function sha256File(
  path: string,
  failureClass: CodexFailureClass,
): Promise<string> {
  return (await inspectOpenFile(path, failureClass)).hash;
}

export async function verifyPinnedExecutable(
  path: string,
  expectedHash: string,
  failureClass: CodexFailureClass,
): Promise<VerifiedFile> {
  assertSafeAbsolutePath(path);
  const verified = await inspectOpenFile(path, failureClass);
  if (verified.hash !== expectedHash) throw new CodexRunnerError(failureClass);
  return verified;
}

export async function verifyPinnedRegularFile(
  path: string,
  expectedHash: string,
  failureClass: CodexFailureClass,
): Promise<VerifiedFile> {
  assertSafeAbsolutePath(path);
  const verified = await inspectOpenFile(path, failureClass, false);
  if (
    verified.hash !== expectedHash ||
    verified.userId !== "0" ||
    verified.groupId !== "0"
  )
    throw new CodexRunnerError(failureClass);
  return verified;
}

function sameFile(left: VerifiedFile, right: VerifiedFile): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.hash === right.hash &&
    left.byteLength === right.byteLength
  );
}

async function protectCodexOriginExclusive(
  input: ProtectOriginInput,
): Promise<ProtectedOrigin> {
  assertSafeAbsolutePath(input.originPath);
  assertSafeAbsolutePath(input.attemptDir);
  const parent = dirname(input.attemptDir);
  if ((await realpath(parent)) !== parent)
    throw new CodexRunnerError("link_untrusted");
  const originHandle = await openNoFollow(input.originPath, "origin_untrusted");
  try {
    const origin = await inspectFileHandle(originHandle, "origin_untrusted");
    if (origin.hash !== input.expectedHash)
      throw new CodexRunnerError("origin_untrusted");
    await mkdir(input.attemptDir, { mode: 0o700, recursive: true });
    await chmod(input.attemptDir, 0o700);
    const directory = await lstat(input.attemptDir, { bigint: true });
    if (!directory.isDirectory() || (directory.mode & 0o777n) !== 0o700n)
      throw new CodexRunnerError("link_untrusted");
    await input.beforeLink?.(originHandle);
    const linkPath = join(input.attemptDir, "codex-bin");
    await (input.linkFile ?? link)(input.originPath, linkPath);
    const currentOrigin = await inspectOpenFile(
      input.originPath,
      "link_untrusted",
    );
    const linkHandle = await openNoFollow(linkPath, "link_untrusted");
    let protectedLink: VerifiedFile;
    try {
      protectedLink = await inspectFileHandle(linkHandle, "link_untrusted");
    } finally {
      await linkHandle.close();
    }
    if (!sameFile(origin, currentOrigin) || !sameFile(origin, protectedLink))
      throw new CodexRunnerError("link_untrusted");
    return Object.freeze({ linkPath, origin, link: protectedLink });
  } catch (error) {
    if (error instanceof CodexRunnerError) throw error;
    throw new CodexRunnerError("link_untrusted");
  } finally {
    await originHandle.close();
  }
}

export async function protectCodexOrigin(
  input: ProtectOriginInput,
): Promise<ProtectedOrigin> {
  const previous = originProtectionTail;
  let release: (() => void) | undefined;
  originProtectionTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await protectCodexOriginExclusive(input);
  } finally {
    release?.();
  }
}

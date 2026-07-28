import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";

const AUTH_DIRECTORY = "local-auth";
const SECRET_FILE = "session-secret";
const TOKEN_FILE = "automation-token";
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export class LocalAuthFileError extends Error {
  readonly reason:
    | "invalid_type"
    | "malformed"
    | "storage_unavailable"
    | "unsafe_path"
    | "unsafe_permissions";

  constructor(reason: LocalAuthFileError["reason"]) {
    super("Local authentication storage is invalid");
    this.name = "LocalAuthFileError";
    this.reason = reason;
  }
}

export type LocalAuthFiles = {
  readonly secret: string;
  readonly token: string;
  readonly tokenPath: string;
};

function isErrno(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === code
  );
}

function isFileSystemError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && typeof error.code === "string"
  );
}

async function requirePrivateDirectory(path: string): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new LocalAuthFileError("unsafe_path");
  }
  if ((metadata.mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    throw new LocalAuthFileError("unsafe_permissions");
  }
}

async function readPrivateCredential(path: string): Promise<string> {
  let handle: FileHandle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isErrno(error, "ELOOP") || isErrno(error, "ENOTDIR")) {
      throw new LocalAuthFileError("unsafe_path");
    }
    throw error;
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.nlink !== 1) {
      throw new LocalAuthFileError("invalid_type");
    }
    if ((metadata.mode & 0o777) !== PRIVATE_FILE_MODE) {
      throw new LocalAuthFileError("unsafe_permissions");
    }
    const value = await handle.readFile("utf8");
    if (!SECRET_PATTERN.test(value)) {
      throw new LocalAuthFileError("malformed");
    }
    return value;
  } finally {
    await handle.close();
  }
}

async function createCredential(path: string): Promise<string> {
  const value = randomBytes(32).toString("base64url");
  try {
    const handle = await open(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      PRIVATE_FILE_MODE,
    );
    try {
      await handle.writeFile(value, "utf8");
      await handle.sync();
      return value;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (isErrno(error, "EEXIST")) {
      return readPrivateCredential(path);
    }
    throw error;
  }
}

async function replaceCredential(path: string): Promise<string> {
  await readPrivateCredential(path);
  const replacementPath = `${path}.rotate-${randomBytes(12).toString("hex")}`;
  const value = randomBytes(32).toString("base64url");
  const handle = await open(
    replacementPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    PRIVATE_FILE_MODE,
  );
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(replacementPath, path);
    return value;
  } catch (error) {
    await unlink(replacementPath);
    throw error;
  }
}

async function requireAuthDirectory(dataRoot: string): Promise<string> {
  await mkdir(dataRoot, { recursive: true });
  const directory = join(dataRoot, AUTH_DIRECTORY);
  try {
    await mkdir(directory, { mode: PRIVATE_DIRECTORY_MODE });
  } catch (error) {
    if (!isErrno(error, "EEXIST")) {
      throw error;
    }
  }
  await requirePrivateDirectory(directory);
  return directory;
}

export async function ensureLocalAuthFiles(
  dataRoot: string,
): Promise<LocalAuthFiles> {
  try {
    const directory = await requireAuthDirectory(dataRoot);
    const secretPath = join(directory, SECRET_FILE);
    const tokenPath = join(directory, TOKEN_FILE);
    const secret = await createCredential(secretPath);
    const token = await createCredential(tokenPath);
    return { secret, token, tokenPath };
  } catch (error) {
    if (error instanceof LocalAuthFileError) {
      throw error;
    }
    if (isFileSystemError(error)) {
      throw new LocalAuthFileError("storage_unavailable");
    }
    throw error;
  }
}

export async function rotateLocalAuthFiles(
  dataRoot: string,
): Promise<LocalAuthFiles> {
  try {
    const directory = await requireAuthDirectory(dataRoot);
    const secretPath = join(directory, SECRET_FILE);
    const tokenPath = join(directory, TOKEN_FILE);
    await readPrivateCredential(secretPath);
    await readPrivateCredential(tokenPath);
    const token = await replaceCredential(tokenPath);
    const secret = await replaceCredential(secretPath);
    return { secret, token, tokenPath };
  } catch (error) {
    if (error instanceof LocalAuthFileError) {
      throw error;
    }
    if (isFileSystemError(error)) {
      throw new LocalAuthFileError("storage_unavailable");
    }
    throw error;
  }
}

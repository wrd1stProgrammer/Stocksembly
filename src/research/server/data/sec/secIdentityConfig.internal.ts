import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { constants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  SecIdentityConfigError,
  type SecIdentityInput,
  SecIdentityInputSchema,
} from "./secIdentityConfig";

export type SecTransportIdentity = Readonly<
  SecIdentityInput & { readonly identityHash: string }
>;

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function configPaths(dataRoot: string): {
  readonly directory: string;
  readonly file: string;
} {
  if (!isAbsolute(dataRoot))
    throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
  const directory = join(dataRoot, "config");
  return { directory, file: join(directory, "sec-identity.json") };
}

async function privateMetadata(
  path: string,
  expectedMode: number,
): Promise<Stats> {
  let metadata: Stats;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (isCode(error, "ENOENT"))
      throw new SecIdentityConfigError("SEC_IDENTITY_REQUIRED");
    throw error;
  }
  if (metadata.isSymbolicLink())
    throw new SecIdentityConfigError("SEC_IDENTITY_SYMLINK");
  if ((metadata.mode & 0o777) !== expectedMode)
    throw new SecIdentityConfigError("SEC_IDENTITY_PERMISSIONS");
  return metadata;
}

export async function loadSecIdentityForTransport(
  dataRoot: string,
): Promise<SecTransportIdentity> {
  const paths = configPaths(dataRoot);
  const directory = await privateMetadata(paths.directory, 0o700);
  if (!directory.isDirectory())
    throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
  const file = await privateMetadata(paths.file, 0o600);
  if (!file.isFile())
    throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");

  let handle: FileHandle;
  try {
    handle = await open(paths.file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (isCode(error, "ELOOP"))
      throw new SecIdentityConfigError("SEC_IDENTITY_SYMLINK");
    throw error;
  }
  try {
    const openedMetadata = await handle.stat();
    if (!openedMetadata.isFile() || (openedMetadata.mode & 0o777) !== 0o600)
      throw new SecIdentityConfigError("SEC_IDENTITY_PERMISSIONS");
    const raw = await handle.readFile("utf8");
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
      throw error;
    }
    const parsed = SecIdentityInputSchema.safeParse(decoded);
    if (!parsed.success)
      throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
    return Object.freeze({
      ...parsed.data,
      identityHash: createHash("sha256")
        .update(JSON.stringify(parsed.data))
        .digest("hex"),
    });
  } finally {
    await handle.close();
  }
}

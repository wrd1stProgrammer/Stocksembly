import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { loadSecIdentityForTransport } from "./secIdentityConfig.internal";

export const CONFIGURE_SEC_IDENTITY_COMMAND =
  "pnpm research:configure-sec-identity";
export const REQUIRE_SEC_IDENTITY_COMMAND =
  "pnpm research:require-sec-identity";

export const SecIdentityInputSchema = z
  .object({
    organization: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(/^[^\r\n]+$/),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .email()
      .regex(/^[^\r\n]+$/),
  })
  .strict();

export type SecIdentityInput = z.infer<typeof SecIdentityInputSchema>;

export type SecIdentityStatus = {
  readonly configured: true;
  readonly identityHash: string;
};

export const SEC_IDENTITY_ERROR_CODES = [
  "SEC_IDENTITY_REQUIRED",
  "SEC_IDENTITY_MALFORMED",
  "SEC_IDENTITY_PERMISSIONS",
  "SEC_IDENTITY_SYMLINK",
  "SEC_IDENTITY_WRITE_FAILED",
  "SEC_IDENTITY_CONFIRMATION_DECLINED",
] as const;
export type SecIdentityErrorCode = (typeof SEC_IDENTITY_ERROR_CODES)[number];

export class SecIdentityConfigError extends Error {
  readonly name = "SecIdentityConfigError";
  readonly setupCommand = CONFIGURE_SEC_IDENTITY_COMMAND;

  constructor(readonly code: SecIdentityErrorCode) {
    super(
      code === "SEC_IDENTITY_REQUIRED"
        ? `SEC_IDENTITY_REQUIRED: run ${CONFIGURE_SEC_IDENTITY_COMMAND}`
        : code,
    );
  }
}

type IdentityPaths = {
  readonly directory: string;
  readonly file: string;
};

function identityPaths(dataRoot: string): IdentityPaths {
  if (!isAbsolute(dataRoot))
    throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
  const directory = join(dataRoot, "config");
  return { directory, file: join(directory, "sec-identity.json") };
}

function identityHash(identity: SecIdentityInput): string {
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

function statusFor(identity: SecIdentityInput): SecIdentityStatus {
  return Object.freeze({
    configured: true,
    identityHash: identityHash(identity),
  });
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function requireSecIdentity(
  dataRoot: string,
): Promise<SecIdentityStatus> {
  const identity = await loadSecIdentityForTransport(dataRoot);
  return Object.freeze({
    configured: true,
    identityHash: identity.identityHash,
  });
}

export async function configureSecIdentity(
  dataRoot: string,
  input: unknown,
): Promise<SecIdentityStatus> {
  const parsed = SecIdentityInputSchema.safeParse(input);
  if (!parsed.success)
    throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
  const paths = identityPaths(dataRoot);
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  const directoryMetadata = await lstat(paths.directory);
  if (directoryMetadata.isSymbolicLink())
    throw new SecIdentityConfigError("SEC_IDENTITY_SYMLINK");
  if (!directoryMetadata.isDirectory())
    throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
  await chmod(paths.directory, 0o700);
  try {
    const current = await lstat(paths.file);
    if (current.isSymbolicLink())
      throw new SecIdentityConfigError("SEC_IDENTITY_SYMLINK");
    if (!current.isFile())
      throw new SecIdentityConfigError("SEC_IDENTITY_MALFORMED");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }

  const temporaryPath = join(
    paths.directory,
    `.sec-identity-${randomUUID()}.tmp`,
  );
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(parsed.data)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, paths.file);
    const directoryHandle = await open(paths.directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await rm(temporaryPath, { force: true });
    if (error instanceof SecIdentityConfigError) throw error;
    throw new SecIdentityConfigError("SEC_IDENTITY_WRITE_FAILED");
  }
  return statusFor(parsed.data);
}

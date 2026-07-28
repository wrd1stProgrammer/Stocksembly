import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const CacheMetadataSchema = z
  .object({
    sourceUrl: z.string().url(),
    contentType: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    storedAt: z.string().datetime(),
    etag: z.string().min(1).optional(),
    lastModified: z.string().min(1).optional(),
  })
  .strict();

type CacheMetadata = z.infer<typeof CacheMetadataSchema>;

export type SecCacheEntry = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly contentHash: string;
  readonly etag?: string;
  readonly lastModified?: string;
};

export class SecCacheCorruptionError extends Error {
  readonly name = "SecCacheCorruptionError";
  readonly code = "SEC_CACHE_CORRUPT";

  constructor() {
    super("SEC_CACHE_CORRUPT");
  }
}

type CachePaths = {
  readonly directory: string;
  readonly body: string;
  readonly metadata: string;
};

function cachePaths(dataRoot: string, sourceUrl: string): CachePaths {
  const key = createHash("sha256").update(sourceUrl).digest("hex");
  const directory = join(dataRoot, "cache", "sec");
  return {
    directory,
    body: join(directory, `${key}.body`),
    metadata: join(directory, `${key}.json`),
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function readSecCache(
  dataRoot: string,
  sourceUrl: string,
): Promise<SecCacheEntry | undefined> {
  const paths = cachePaths(dataRoot, sourceUrl);
  let rawMetadata: string;
  let body: Uint8Array;
  try {
    [rawMetadata, body] = await Promise.all([
      readFile(paths.metadata, "utf8"),
      readFile(paths.body),
    ]);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawMetadata);
  } catch (error) {
    if (error instanceof SyntaxError) throw new SecCacheCorruptionError();
    throw error;
  }
  const parsed = CacheMetadataSchema.safeParse(decoded);
  if (!parsed.success) throw new SecCacheCorruptionError();
  if (
    parsed.data.sourceUrl !== sourceUrl ||
    sha256(body) !== parsed.data.contentHash
  )
    throw new SecCacheCorruptionError();
  return Object.freeze({
    bytes: Uint8Array.from(body),
    contentType: parsed.data.contentType,
    contentHash: parsed.data.contentHash,
    ...(parsed.data.etag === undefined ? {} : { etag: parsed.data.etag }),
    ...(parsed.data.lastModified === undefined
      ? {}
      : { lastModified: parsed.data.lastModified }),
  });
}

export async function writeSecCache(options: {
  readonly dataRoot: string;
  readonly sourceUrl: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly contentHash: string;
  readonly storedAt: string;
  readonly etag?: string;
  readonly lastModified?: string;
}): Promise<void> {
  const paths = cachePaths(options.dataRoot, options.sourceUrl);
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  await chmod(paths.directory, 0o700);
  const metadata: CacheMetadata = {
    sourceUrl: options.sourceUrl,
    contentType: options.contentType,
    contentHash: options.contentHash,
    storedAt: options.storedAt,
    ...(options.etag === undefined ? {} : { etag: options.etag }),
    ...(options.lastModified === undefined
      ? {}
      : { lastModified: options.lastModified }),
  };
  await atomicWrite(paths.body, options.bytes);
  await atomicWrite(
    paths.metadata,
    Buffer.from(`${JSON.stringify(metadata)}\n`),
  );
}

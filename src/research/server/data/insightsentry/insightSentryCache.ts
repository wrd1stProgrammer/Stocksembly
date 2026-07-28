import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { InsightSentryCacheMetadataSchema } from "./insightSentrySchemas";

export type InsightSentryCacheEntry = {
  readonly bytes: Uint8Array;
  readonly retrievedAt: string;
  readonly responseBytes: number;
};

function paths(
  dataRoot: string,
  cacheKey: string,
): Readonly<{ body: string; metadata: string; directory: string }> {
  const digest = createHash("sha256").update(cacheKey).digest("hex");
  const directory = join(dataRoot, "insightsentry", "cache");
  return {
    directory,
    body: join(directory, `${digest}.body`),
    metadata: join(directory, `${digest}.json`),
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function readInsightSentryCache(
  dataRoot: string,
  cacheKey: string,
  now: number,
): Promise<InsightSentryCacheEntry | undefined> {
  const target = paths(dataRoot, cacheKey);
  let body: Uint8Array;
  let rawMetadata: string;
  try {
    [body, rawMetadata] = await Promise.all([
      readFile(target.body),
      readFile(target.metadata, "utf8"),
    ]);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawMetadata);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const metadata = InsightSentryCacheMetadataSchema.safeParse(decoded);
  if (
    !metadata.success ||
    metadata.data.cacheKey !== cacheKey ||
    metadata.data.responseBytes !== body.byteLength ||
    Date.parse(metadata.data.expiresAt) <= now
  )
    return undefined;
  return Object.freeze({
    bytes: Uint8Array.from(body),
    retrievedAt: metadata.data.retrievedAt,
    responseBytes: metadata.data.responseBytes,
  });
}

export async function writeInsightSentryCache(input: {
  readonly dataRoot: string;
  readonly cacheKey: string;
  readonly bytes: Uint8Array;
  readonly retrievedAt: string;
  readonly expiresAt: string;
}): Promise<void> {
  const target = paths(input.dataRoot, input.cacheKey);
  await mkdir(target.directory, { recursive: true, mode: 0o700 });
  await atomicWrite(target.body, input.bytes);
  await atomicWrite(
    target.metadata,
    Buffer.from(
      `${JSON.stringify({
        cacheKey: input.cacheKey,
        retrievedAt: input.retrievedAt,
        expiresAt: input.expiresAt,
        responseBytes: input.bytes.byteLength,
      })}\n`,
    ),
  );
}

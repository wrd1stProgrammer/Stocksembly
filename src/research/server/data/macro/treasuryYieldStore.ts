import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const MetadataSchema = z
  .object({
    year: z.number().int(),
    retrievedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

function paths(dataRoot: string, year: number) {
  const directory = join(dataRoot, "macro", "treasury");
  return {
    directory,
    body: join(directory, `${year}.csv`),
    metadata: join(directory, `${year}.json`),
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function atomicWrite(path: string, value: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value, { mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function readTreasuryYieldCache(
  dataRoot: string,
  year: number,
  now: number,
): Promise<{ readonly body: string; readonly retrievedAt: string } | undefined> {
  const target = paths(dataRoot, year);
  let body: string;
  let metadataText: string;
  try {
    [body, metadataText] = await Promise.all([
      readFile(target.body, "utf8"),
      readFile(target.metadata, "utf8"),
    ]);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(metadataText);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const metadata = MetadataSchema.safeParse(decoded);
  if (
    !metadata.success ||
    metadata.data.year !== year ||
    Date.parse(metadata.data.expiresAt) <= now ||
    createHash("sha256").update(body).digest("hex") !==
      metadata.data.contentHash
  )
    return undefined;
  return { body, retrievedAt: metadata.data.retrievedAt };
}

export async function writeTreasuryYieldCache(input: {
  readonly dataRoot: string;
  readonly year: number;
  readonly body: string;
  readonly retrievedAt: string;
  readonly expiresAt: string;
}): Promise<void> {
  const target = paths(input.dataRoot, input.year);
  await mkdir(target.directory, { recursive: true, mode: 0o700 });
  await atomicWrite(target.body, input.body);
  await atomicWrite(
    target.metadata,
    `${JSON.stringify({
      year: input.year,
      retrievedAt: input.retrievedAt,
      expiresAt: input.expiresAt,
      contentHash: createHash("sha256").update(input.body).digest("hex"),
    })}\n`,
  );
}

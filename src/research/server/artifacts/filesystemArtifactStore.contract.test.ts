import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactDigestSchema } from "../../ports/artifacts";
import {
  ArtifactStoreError,
  resolveArtifactBlobPath,
  resolveStocksemblyDataDirectory,
} from "./filesystemArtifactStore";
import {
  cleanupDataDirectories,
  createArtifactStoreFixture,
  createDataDirectory,
  InjectedDurabilityError,
  MetadataConflictError,
  makeArtifactWrite,
  runArtifactProcessPut,
  trackDataDirectory,
} from "./filesystemArtifactStore.contract.fixtures";

afterEach(cleanupDataDirectories);

describe("filesystem artifact CAS contract", () => {
  it("deduplicates identical bytes with SHA-256 identity and private permissions", async () => {
    // Given
    const { dataDirectory, store } = await createArtifactStoreFixture();
    const write = makeArtifactWrite("same immutable bytes");

    // When
    const first = await store.put(write);
    const second = await store.put(write);

    // Then
    const expected = createHash("sha256").update(write.bytes).digest("hex");
    expect(first.digest).toBe(expected);
    expect(second).toEqual(first);
    expect((await lstat(dataDirectory)).mode & 0o777).toBe(0o700);
    const blob = resolveArtifactBlobPath(dataDirectory, first.digest);
    expect((await lstat(blob)).mode & 0o777).toBe(0o600);
    expect(await readdir(dirname(blob))).toEqual([first.digest.slice(2)]);
  });

  it("serializes concurrent puts into one durable blob before metadata commit", async () => {
    // Given
    const { dataDirectory, metadata, store } =
      await createArtifactStoreFixture();
    const write = makeArtifactWrite("concurrent payload");

    // When
    const descriptors = await Promise.all(
      Array.from({ length: 12 }, () => store.put(write)),
    );

    // Then
    expect(new Set(descriptors.map(({ digest }) => digest)).size).toBe(1);
    expect(metadata.commitOrder).toHaveLength(12);
    const blob = resolveArtifactBlobPath(dataDirectory, descriptors[0]?.digest);
    expect([...(await readFile(blob))]).toEqual([...write.bytes]);
    expect(await readdir(dirname(blob))).toEqual([
      descriptors[0]?.digest.slice(2),
    ]);
  });

  it("deduplicates one payload across independent processes", async () => {
    // Given
    const dataDirectory = trackDataDirectory(await createDataDirectory());

    // When
    await Promise.all([
      runArtifactProcessPut(dataDirectory),
      runArtifactProcessPut(dataDirectory),
    ]);

    // Then
    const digest = createHash("sha256").update("process payload").digest("hex");
    const blob = resolveArtifactBlobPath(dataDirectory, digest);
    expect([...(await readFile(blob))]).toEqual([
      ...new TextEncoder().encode("process payload"),
    ]);
    expect(await readdir(dirname(blob))).toEqual([digest.slice(2)]);
  });

  it("stops an oversized stream and removes its temporary file", async () => {
    // Given
    const { dataDirectory, metadata, store } = await createArtifactStoreFixture(
      {
        maxBlobBytes: 5,
      },
    );
    const write = makeArtifactWrite("ignored");
    async function* chunks() {
      yield new TextEncoder().encode("1234");
      yield new TextEncoder().encode("56");
      throw new RangeError("the stream must stop before this chunk");
    }

    // When / Then
    await expect(
      store.putStream({ ...write, bytes: undefined, chunks: chunks() }),
    ).rejects.toMatchObject({ code: "ARTIFACT_TOO_LARGE" });
    expect(metadata.commitOrder).toHaveLength(0);
    expect(await store.listTemporaryFiles()).toEqual([]);
    expect(await readdir(join(dataDirectory, "artifacts", "sha256"))).toEqual(
      [],
    );
  });

  it("cleans stale same-directory power-loss residue without treating it as a blob", async () => {
    // Given
    const { dataDirectory, store } = await createArtifactStoreFixture();
    const digest = ArtifactDigestSchema.parse("a".repeat(64));
    const blob = resolveArtifactBlobPath(dataDirectory, digest);
    await mkdir(dirname(blob), { recursive: true, mode: 0o700 });
    const residue = join(dirname(blob), ".artifact-tmp-dead");
    await writeFile(residue, "partial", { mode: 0o600 });
    await utimes(residue, new Date(0), new Date(0));

    // When
    const removed = await store.cleanupStaleTemporaryFiles({
      olderThan: new Date(1),
    });

    // Then
    expect(removed).toBe(1);
    expect(await store.listTemporaryFiles()).toEqual([]);
    expect(await store.scanOrphans()).toEqual([]);
  });

  it.each(["file-sync", "rename"] as const)(
    "does not commit metadata or leave residue when %s fails",
    async (failAt) => {
      // Given
      const { metadata, store } = await createArtifactStoreFixture({ failAt });

      // When / Then
      await expect(store.put(makeArtifactWrite(failAt))).rejects.toBeInstanceOf(
        InjectedDurabilityError,
      );
      expect(metadata.commitOrder).toHaveLength(0);
      expect(await store.listTemporaryFiles()).toEqual([]);
      expect(await store.scanOrphans()).toEqual([]);
    },
  );

  it("leaves a detectable orphan and no metadata when directory fsync fails", async () => {
    // Given
    const { metadata, store } = await createArtifactStoreFixture({
      failAt: "directory-sync",
    });

    // When / Then
    await expect(
      store.put(makeArtifactWrite("uncertain durability")),
    ).rejects.toBeInstanceOf(InjectedDurabilityError);
    expect(metadata.commitOrder).toHaveLength(0);
    expect(await store.scanOrphans()).toHaveLength(1);
  });

  it("rejects traversal and never follows a fan-out symlink outside the root", async () => {
    // Given
    const { dataDirectory, store } = await createArtifactStoreFixture();
    const outside = trackDataDirectory(await createDataDirectory());
    await mkdir(join(dataDirectory, "artifacts", "sha256"), {
      recursive: true,
      mode: 0o700,
    });
    const payload = "symlink payload";
    const digest = createHash("sha256").update(payload).digest("hex");
    await symlink(
      outside,
      join(dataDirectory, "artifacts", "sha256", digest.slice(0, 2)),
    );
    await chmod(outside, 0o700);

    // When / Then
    expect(() => resolveArtifactBlobPath(dataDirectory, "../escape")).toThrow(
      ArtifactStoreError,
    );
    await expect(store.put(makeArtifactWrite(payload))).rejects.toMatchObject({
      code: "ARTIFACT_UNSAFE_PATH",
    });
    expect(await readdir(outside)).toEqual([]);
  });

  it("never overwrites a committed path that was replaced by a symlink", async () => {
    // Given
    const { dataDirectory, store } = await createArtifactStoreFixture();
    const outside = trackDataDirectory(await createDataDirectory());
    const target = join(outside, "target");
    const write = makeArtifactWrite("protected target");
    const digest = createHash("sha256").update(write.bytes).digest("hex");
    const blob = resolveArtifactBlobPath(dataDirectory, digest);
    await mkdir(dirname(blob), { recursive: true, mode: 0o700 });
    await writeFile(target, "sentinel", { mode: 0o600 });
    await symlink(target, blob);

    // When / Then
    await expect(store.put(write)).rejects.toMatchObject({
      code: "ARTIFACT_UNSAFE_PATH",
    });
    expect(await readFile(target, "utf8")).toBe("sentinel");
  });

  it("never overwrites a final path created between the absence check and commit", async () => {
    // Given
    const write = makeArtifactWrite("race winner");
    const digest = createHash("sha256").update(write.bytes).digest("hex");
    const { dataDirectory, metadata, store } = await createArtifactStoreFixture(
      {
        injectFault: async (point, root) => {
          if (point === "rename") {
            const finalPath = resolveArtifactBlobPath(root, digest);
            await writeFile(finalPath, "race loser!", {
              flag: "wx",
              mode: 0o600,
            });
          }
        },
      },
    );
    const blob = resolveArtifactBlobPath(dataDirectory, digest);

    // When / Then
    await expect(store.put(write)).rejects.toMatchObject({
      code: "ARTIFACT_HASH_MISMATCH",
    });
    expect(await readFile(blob, "utf8")).toBe("race loser!");
    expect(metadata.commitOrder).toHaveLength(0);
    expect(await store.listTemporaryFiles()).toEqual([]);
  });

  it("quarantines a corrupted blob and raises ARTIFACT_HASH_MISMATCH", async () => {
    // Given
    const { dataDirectory, store } = await createArtifactStoreFixture();
    const descriptor = await store.put(makeArtifactWrite("verified bytes"));
    const blob = resolveArtifactBlobPath(dataDirectory, descriptor.digest);
    await writeFile(blob, "corrupt", { mode: 0o600 });

    // When / Then
    await expect(store.get(descriptor.digest)).rejects.toMatchObject({
      code: "ARTIFACT_HASH_MISMATCH",
    });
    await expect(lstat(blob)).rejects.toMatchObject({ code: "ENOENT" });
    const quarantined = await readdir(
      join(dataDirectory, "artifacts", "quarantine"),
    );
    expect(quarantined).toHaveLength(1);
    expect([
      ...(await readFile(
        join(dataDirectory, "artifacts", "quarantine", quarantined[0] ?? ""),
      )),
    ]).toEqual([...new TextEncoder().encode("corrupt")]);
  });

  it("finds metadata-orphaned blobs without mutating them", async () => {
    // Given
    const { dataDirectory, metadata, store } =
      await createArtifactStoreFixture();
    const descriptor = await store.put(makeArtifactWrite("orphan bytes"));
    metadata.forget(descriptor.digest);

    // When
    const orphans = await store.scanOrphans();

    // Then
    expect(orphans).toEqual([
      {
        byteLength: 12,
        digest: descriptor.digest,
        relativePath: `artifacts/sha256/${descriptor.digest.slice(0, 2)}/${descriptor.digest.slice(2)}`,
      },
    ]);
    expect([
      ...(await readFile(
        resolveArtifactBlobPath(dataDirectory, descriptor.digest),
      )),
    ]).toEqual([...new TextEncoder().encode("orphan bytes")]);
  });

  it("keeps accepted metadata and digest immutable", async () => {
    // Given
    const { metadata, store } = await createArtifactStoreFixture();
    const write = makeArtifactWrite("immutable");
    const accepted = await store.put(write);

    // When / Then
    await expect(
      store.put({ ...write, mediaType: "text/plain" }),
    ).rejects.toBeInstanceOf(MetadataConflictError);
    expect(await metadata.find(accepted.digest)).toEqual(accepted);
    expect((await store.get(accepted.digest))?.descriptor).toEqual(accepted);
  });

  it("resolves the configured STOCKSEMBLY_DATA_DIR without accepting relative roots", () => {
    // Given
    const absolute = join(process.cwd(), "private-data");

    // When / Then
    expect(
      resolveStocksemblyDataDirectory({ STOCKSEMBLY_DATA_DIR: absolute }),
    ).toBe(absolute);
    expect(() =>
      resolveStocksemblyDataDirectory({ STOCKSEMBLY_DATA_DIR: "../escape" }),
    ).toThrow(ArtifactStoreError);
  });
});

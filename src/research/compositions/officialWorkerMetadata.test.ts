import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactDigestSchema } from "../ports/artifacts";
import {
  at,
  createRunFixture,
  fixture,
  hash,
  temporaryDatabase,
} from "../server/persistence/sqlite/sqliteStore.contractFixtures";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import { CommittedArtifactMetadata } from "./officialWorkerMetadata";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("CommittedArtifactMetadata", () => {
  it("keeps the committed descriptor when a same-digest retry is staged", async () => {
    const temporary = temporaryDatabase();
    directories.push(temporary.directory);
    const ids = fixture(90);
    const store = openSqliteStore(temporary.path);
    store.createRun(createRunFixture(90));
    store.saveArtifactMetadata({
      artifactId: ids.artifactId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      contentHash: hash(1),
      byteLength: 12,
      mediaType: "application/json",
      logicalKey: "evidence:canonical",
      inputHash: hash(2),
      createdAt: at(1),
    });
    const metadata = new CommittedArtifactMetadata(temporary.path);

    await metadata.commit({
      artifactId: ids.parentArtifactId,
      runId: ids.runId,
      snapshotId: ids.snapshotId,
      digest: ArtifactDigestSchema.parse(hash(1)),
      byteLength: 12,
      mediaType: "application/json",
      parentDigests: [],
    });

    await expect(
      metadata.find(ArtifactDigestSchema.parse(hash(1))),
    ).resolves.toMatchObject({ artifactId: ids.artifactId });
    metadata.close();
    store.close();
  });
});

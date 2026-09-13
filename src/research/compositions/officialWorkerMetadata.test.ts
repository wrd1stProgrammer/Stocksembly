import { afterEach, describe, expect, it } from "vitest";
import { ArtifactDigestSchema } from "../ports/artifacts";
import { openPostgresStore } from "../server/persistence/postgres/postgresStore";
import {
  at,
  createRunFixture,
  fixture,
  hash,
  temporaryDatabase,
} from "../server/persistence/postgres/postgresStore.contractFixtures";
import { CommittedArtifactMetadata } from "./officialWorkerMetadata";

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

describe("CommittedArtifactMetadata", () => {
  it("keeps the committed descriptor when a same-digest retry is staged", async () => {
    const temporary = await temporaryDatabase();
    cleanups.push(temporary.close);
    const ids = fixture(90);
    const store = await openPostgresStore(temporary.path);
    await store.createRun(createRunFixture(90));
    await store.saveArtifactMetadata({
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
    await store.close();
  });
});

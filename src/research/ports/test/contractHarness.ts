import assert from "node:assert/strict";
import {
  contractEvent,
  contractHistory,
  contractIds,
  contractJob,
  contractQuestion,
  contractRun,
} from "./contractFixtures";
import type { StrictTestPorts } from "./strictFakes";

export type ContractReceipt = {
  readonly passed: true;
  readonly scenarios: 14;
};

export async function verifyResearchPortContracts(
  ports: StrictTestPorts,
): Promise<ContractReceipt> {
  await assert.rejects(
    ports.stores.transaction(async (stores) => {
      await stores.saveRun(contractRun);
      throw new RangeError("rollback");
    }),
    RangeError,
  );
  await ports.stores.transaction(async (stores) => {
    assert.equal(await stores.findRun(contractIds.runId), undefined);
    await stores.saveRun(contractRun);
  });

  await ports.stores.transaction(async (stores) => {
    await stores.saveJob(contractJob);
    assert.equal(
      (await stores.findJob(contractJob.jobId))?.logicalKey,
      "memo:market",
    );
  });

  await ports.stores.transaction(async (stores) => {
    await stores.appendEvent(contractEvent);
    assert.deepEqual(await stores.eventsAfter(contractIds.runId, 0), [
      contractEvent,
    ]);
  });

  await ports.stores.transaction(async (stores) => {
    await stores.saveHistory(contractHistory);
    assert.equal(
      (await stores.findHistory(contractIds.reportId))?.versions.length,
      1,
    );
  });

  await ports.stores.transaction(async (stores) => {
    await stores.saveQuestion(contractQuestion);
    assert.equal(
      (await stores.findQuestion(contractQuestion.questionId))?.status,
      "pending",
    );
  });

  const artifactInput = {
    artifactId: contractIds.artifactId,
    runId: contractIds.runId,
    snapshotId: contractIds.snapshotId,
    mediaType: "application/json",
    parentDigests: [],
    bytes: new TextEncoder().encode("evidence"),
  };
  const firstArtifact = await ports.artifacts.put(artifactInput);
  const duplicateArtifact = await ports.artifacts.put(artifactInput);
  assert.equal(firstArtifact.digest, duplicateArtifact.digest);
  assert.equal(
    (await ports.artifacts.get(firstArtifact.digest))?.bytes.byteLength,
    8,
  );

  assert.equal(
    (await ports.issuer.resolve(contractIds.ticker, ports.clock.now()))?.ticker,
    contractIds.ticker,
  );

  const issuer = await ports.issuer.resolve(
    contractIds.ticker,
    ports.clock.now(),
  );
  assert.ok(issuer);
  assert.equal(
    (
      await ports.sec.collect({
        issuer,
        snapshotId: contractIds.snapshotId,
        cutoffAt: ports.clock.now(),
      })
    ).length,
    1,
  );

  assert.equal(
    (
      await ports.macro.collect({
        seriesIds: ["CPIAUCSL"],
        snapshotId: contractIds.snapshotId,
        cutoffAt: ports.clock.now(),
      })
    ).length,
    1,
  );

  assert.equal(ports.clock.now(), "2026-07-22T00:00:00.000Z");
  assert.equal((await ports.capacity.inspect(4_000)).sufficient, true);

  const request = {
    runId: contractIds.runId,
    snapshotId: contractIds.snapshotId,
    attemptId: contractIds.attemptId,
    schemaName: "memo-v1",
    input: new TextEncoder().encode("input"),
    timeoutMs: 1_000,
    cancellation: ports.cancellation,
  };
  assert.equal((await ports.codex.run(request)).status, "succeeded");
  ports.cancellation.cancel("operator-requested");
  assert.equal((await ports.codex.run(request)).status, "cancelled");

  await ports.notifier.notify(contractIds.runId, contractEvent);
  assert.deepEqual(ports.notifier.events, [contractEvent]);

  return { passed: true, scenarios: 14 };
}

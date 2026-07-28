import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOfficialAttemptHandler } from "../compositions/officialWorker";
import { RunIdSchema } from "../domain/ids";
import { createLeaseEngine } from "../worker/leaseEngine";
import { createSqliteDepartmentRound } from "./departmentRound";
import { stageAcceptedSpecialists } from "./departmentRound.testSupport";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

describe("official department worker dispatch", () => {
  it("executes a staged consolidation through the official logical-key handler", async () => {
    // Given
    const root = mkdtempSync(join(tmpdir(), "department-official-"));
    roots.push(root);
    const prepared = await stageAcceptedSpecialists(root, "none");
    const staging = createSqliteDepartmentRound(prepared.options);
    await staging.stage({
      runId: RunIdSchema.parse(prepared.harness.input.mandate.runId),
      memberArtifactIds: staging
        .acceptedMemos(prepared.harness.input.mandate.runId)
        .map((memo) => memo.artifactId),
    });
    await staging.close();
    const official = await createOfficialAttemptHandler(
      {
        dataDirectory: root,
        databasePath: prepared.options.databasePath,
        ownerId: prepared.options.ownerId,
      },
      {
        cas: prepared.options.cas,
        codex: prepared.codex,
        now: prepared.options.now,
      },
    );
    const engine = createLeaseEngine({
      databasePath: prepared.options.databasePath,
      ownerId: prepared.options.ownerId,
      handler: official.handler,
      clock: { now: prepared.options.now },
    });

    // When
    const result = await engine.poll();
    await engine.shutdown();
    await official.close();
    const verification = createSqliteDepartmentRound(prepared.options);
    const replay = verification.replay(prepared.harness.input.mandate.runId);
    await verification.close();

    // Then
    expect(result.kind).toBe("handled");
    expect(prepared.codex.departmentLaunches).toBe(1);
    expect(replay.artifactIds).toHaveLength(1);
    expect(replay.receipts[0]?.outcome).toBe("accepted");
  });
});

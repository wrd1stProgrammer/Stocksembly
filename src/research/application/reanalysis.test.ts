import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import {
  at,
  createRunFixture,
  fixture,
  hash,
  temporaryDatabase,
} from "../server/persistence/sqlite/sqliteStore.contractFixtures";
import {
  reanalyzeRun,
  reanalyzeStoredRun,
  verifyPreSpawnBudget,
} from "./reanalysis";

describe("reanalyzeRun", () => {
  it("creates a new-snapshot child while preserving the prior published report", () => {
    // Given
    const parent = {
      runId: "00000000-0000-4000-8000-000000000030",
      snapshotId: "00000000-0000-4000-8000-000000000031",
      status: "completed" as const,
      reportId: "00000000-0000-4000-8000-000000000032",
      launches: [],
    };

    // When
    const result = reanalyzeRun(parent, {
      childRunId: "00000000-0000-4000-8000-000000000033",
      snapshotId: "00000000-0000-4000-8000-000000000034",
      createdAt: "2026-07-23T00:00:00.000Z",
    });

    // Then
    expect(result).toMatchObject({
      kind: "created",
      parent: { reportId: parent.reportId },
      run: {
        snapshotId: "00000000-0000-4000-8000-000000000034",
        lineage: { kind: "new-snapshot-follow-up", parentRunId: parent.runId },
        priorReportId: parent.reportId,
        ledger: {
          runId: "00000000-0000-4000-8000-000000000033",
          launches: [],
        },
      },
    });
    expect(result.parent).toBe(parent);
  });

  it("terminalizes incomplete before spawn when base, optional, and replacement work cannot fit", () => {
    // Given
    const request = {
      burnedOrdinals: 24,
      remainingBaseCalls: 0,
      requestedOptionalCalls: 3,
      requestedReplacementCalls: 4,
    };

    // When
    const decision = verifyPreSpawnBudget(request);

    // Then
    expect(decision).toEqual({
      kind: "incomplete",
      status: "incomplete",
      publicLimitation: {
        code: "physical_launch_budget_exhausted",
        maximum: 30,
        required: 31,
      },
    });
  });

  it.each([
    ["early memo", 0, 24, 3, 3],
    ["late response", 20, 4, 3, 3],
    ["chair", 23, 1, 3, 3],
  ])(
    "never permits more than 30 launches for %s",
    (_phase, burned, base, optional, replacement) => {
      // Given
      const request = {
        burnedOrdinals: burned,
        remainingBaseCalls: base,
        requestedOptionalCalls: optional,
        requestedReplacementCalls: replacement,
      };

      // When
      const decision = verifyPreSpawnBudget(request);

      // Then
      expect(decision.kind).toBe("allowed");
      if (decision.kind === "allowed")
        expect(decision.maximumPhysicalLaunches).toBe(30);
    },
  );

  it("persists a new-snapshot child and retains its parent's published report", () => {
    // Given
    const temporary = temporaryDatabase();
    const store = openSqliteStore(temporary.path);
    const parentIds = fixture(130);
    const childIds = fixture(131);
    store.createRun(createRunFixture(130));
    store.saveArtifactMetadata({
      artifactId: parentIds.artifactId,
      runId: parentIds.runId,
      snapshotId: parentIds.snapshotId,
      contentHash: hash(130),
      byteLength: 1,
      mediaType: "application/json",
      logicalKey: "report:published",
      inputHash: hash(131),
      createdAt: at(1),
    });
    store.saveReportVersion({
      reportId: parentIds.reportId,
      versionId: parentIds.versionId,
      runId: parentIds.runId,
      snapshotId: parentIds.snapshotId,
      artifactId: parentIds.artifactId,
      status: "complete",
      publishedAt: at(1),
      publicPayload: { status: "complete" },
    });
    store.transitionRun({
      runId: parentIds.runId,
      fromStatus: "queued",
      toStatus: "completed",
      nextJobs: [],
      event: {
        eventId: parentIds.eventId,
        type: "report_published",
        stateId: "completed",
        occurredAt: at(1),
      },
    });

    try {
      // When
      const child = reanalyzeStoredRun(store, {
        parentRunId: parentIds.runId,
        priorReportId: parentIds.reportId,
        childRunId: childIds.runId,
        snapshotId: childIds.snapshotId,
        createdAt: at(2),
        initialJob: {
          jobId: childIds.jobId,
          kind: "research",
          logicalKey: "memo:market",
          inputHash: hash(132),
          createdAt: at(2),
        },
        event: {
          eventId: childIds.initialEventId,
          type: "run_queued",
          stateId: "queued",
          occurredAt: at(2),
        },
      });

      // Then
      expect(child).toMatchObject({
        snapshotId: childIds.snapshotId,
        lineage: {
          kind: "new-snapshot-follow-up",
          parentRunId: parentIds.runId,
        },
        priorReportId: parentIds.reportId,
      });
      expect(store.findRun(parentIds.runId)).toMatchObject({
        status: "completed",
        reportId: parentIds.reportId,
      });
      expect(store.researchOrdinals(childIds.runId)).toEqual([]);
    } finally {
      store.close();
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  });
});

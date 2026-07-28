import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createCallBudgetLedger,
  type LaunchOutcome,
  recordResearchLaunchOutcome,
  reserveResearchLaunch,
} from "../domain/callBudget";
import { WORKFLOW_V1_ROSTER_FINGERPRINT } from "../domain/roleRegistry";
import { openSqliteStore } from "../server/persistence/sqlite/sqliteStore";
import {
  at,
  createRunFixture,
  fixture,
  hash,
  temporaryDatabase,
} from "../server/persistence/sqlite/sqliteStore.contractFixtures";
import { reserveReplacement, retryRun, retryStoredRun } from "./retryRun";

const RUN_ID = "00000000-0000-4000-8000-000000000010";
const failed = {
  runId: RUN_ID,
  snapshotId: "00000000-0000-4000-8000-000000000011",
  status: "incomplete" as const,
  terminalReason: "model_failure" as const,
  ledger: createCallBudgetLedger({
    runId: RUN_ID,
    rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
  }),
};

function withFailedLaunch(
  parent: typeof failed,
  ordinal: number,
  logicalArtifactId: string,
  outcome: LaunchOutcome,
): typeof failed {
  const reserved = reserveResearchLaunch(parent.ledger, {
    ordinal,
    attemptId: `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`,
    logicalArtifactId,
    purpose: "mandatory_first",
    rosterFingerprint: WORKFLOW_V1_ROSTER_FINGERPRINT,
  });
  const recorded = recordResearchLaunchOutcome(reserved.ledger, {
    ordinal,
    outcome,
  });
  return { ...parent, ledger: recorded.ledger };
}

describe("retryRun", () => {
  it("creates a terminal-parent same-snapshot child with a fresh 30-launch ledger", () => {
    // Given
    const childRunId = "00000000-0000-4000-8000-000000000012";

    // When
    const result = retryRun(failed, {
      childRunId,
      createdAt: "2026-07-23T00:00:00.000Z",
    });

    // Then
    expect(result).toMatchObject({
      kind: "created",
      run: {
        runId: childRunId,
        snapshotId: failed.snapshotId,
        status: "queued",
        lineage: { kind: "same-snapshot-retry", parentRunId: failed.runId },
        ledger: { runId: childRunId, launches: [] },
        maxPhysicalLaunches: 30,
      },
    });
  });

  it("rejects a rights failure and enforces one replacement per artifact and three total", () => {
    // Given
    const rightsFailure = {
      ...failed,
      terminalReason: "rights_failure" as const,
    };
    // When
    const rejected = retryRun(rightsFailure, {
      childRunId: "00000000-0000-4000-8000-000000000013",
      createdAt: "2026-07-23T00:00:00.000Z",
    });
    const early = withFailedLaunch(failed, 1, "memo:market", "process_crash");
    const late = withFailedLaunch(early, 2, "response_ballot:risk", "lost");
    const chair = withFailedLaunch(
      late,
      3,
      "chair_synthesis:chair",
      "invalid_schema",
    );
    const fourthFailure = withFailedLaunch(chair, 4, "memo:company", "timeout");
    const first = reserveReplacement(fourthFailure, {
      logicalArtifactId: "memo:market",
      failure: "process_crash",
      attemptId: "00000000-0000-4000-8000-000000000020",
    });
    expect(first.kind).toBe("reserved");
    if (first.kind !== "reserved") return;
    const second = reserveReplacement(first.run, {
      logicalArtifactId: "response_ballot:risk",
      failure: "lost",
      attemptId: "00000000-0000-4000-8000-000000000021",
    });
    expect(second.kind).toBe("reserved");
    if (second.kind !== "reserved") return;
    const third = reserveReplacement(second.run, {
      logicalArtifactId: "chair_synthesis:chair",
      failure: "invalid_schema",
      attemptId: "00000000-0000-4000-8000-000000000022",
    });
    expect(third.kind).toBe("reserved");
    if (third.kind !== "reserved") return;
    const duplicate = reserveReplacement(third.run, {
      logicalArtifactId: "memo:market",
      failure: "timeout",
      attemptId: "00000000-0000-4000-8000-000000000023",
    });
    const fourth = reserveReplacement(third.run, {
      logicalArtifactId: "memo:company",
      failure: "uncertain",
      attemptId: "00000000-0000-4000-8000-000000000024",
    });

    // Then
    expect(rejected.kind).toBe("not_retryable");
    expect([
      first.kind,
      second.kind,
      third.kind,
      duplicate.kind,
      fourth.kind,
    ]).toEqual([
      "reserved",
      "reserved",
      "reserved",
      "incomplete",
      "incomplete",
    ]);
    expect(third.run.ledger.launches.map((launch) => launch.ordinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("classifies transient source failures without burning a physical launch", () => {
    // Given
    const before = failed.ledger;

    // When
    const result = reserveReplacement(failed, {
      logicalArtifactId: "memo:market",
      failure: "transient_source",
      attemptId: "00000000-0000-4000-8000-000000000025",
    });

    // Then
    expect(result).toEqual({ kind: "source_retry", run: failed });
    expect(result.run.ledger).toBe(before);
  });

  it.each([
    ["cancelled", "cancelled_race"],
    ["unknown", "uncertain"],
  ] as const)(
    "keeps the reserved ordinal burned after a %s outcome",
    (failure, outcome) => {
      // Given
      const burned = withFailedLaunch(failed, 1, "memo:market", outcome);

      // When
      const replacement = reserveReplacement(burned, {
        logicalArtifactId: "memo:market",
        failure,
        attemptId: "00000000-0000-4000-8000-000000000026",
      });

      // Then
      expect(replacement.kind).toBe("reserved");
      expect(
        replacement.run.ledger.launches.map((launch) => launch.ordinal),
      ).toEqual([1, 2]);
      expect(replacement.run.ledger.launches[0]?.outcome).toBe(outcome);
    },
  );

  it("persists a same-snapshot child while leaving its terminal parent immutable", () => {
    // Given
    const temporary = temporaryDatabase();
    const store = openSqliteStore(temporary.path);
    const parentIds = fixture(120);
    const childIds = fixture(121);
    store.createRun(createRunFixture(120));
    store.transitionRun({
      runId: parentIds.runId,
      fromStatus: "queued",
      toStatus: "incomplete",
      nextJobs: [],
      event: {
        eventId: parentIds.eventId,
        type: "run_incomplete",
        stateId: "incomplete",
        occurredAt: at(1),
      },
    });

    try {
      // When
      const child = retryStoredRun(store, {
        parentRunId: parentIds.runId,
        childRunId: childIds.runId,
        createdAt: at(2),
        initialJob: {
          jobId: childIds.jobId,
          kind: "research",
          logicalKey: "memo:market",
          inputHash: hash(121),
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
        status: "queued",
        snapshotId: parentIds.snapshotId,
        lineage: {
          kind: "same-snapshot-retry",
          parentRunId: parentIds.runId,
        },
      });
      expect(store.findRun(parentIds.runId)).toMatchObject({
        status: "incomplete",
        snapshotId: parentIds.snapshotId,
      });
      expect(store.researchOrdinals(childIds.runId)).toEqual([]);
    } finally {
      store.close();
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  });
});

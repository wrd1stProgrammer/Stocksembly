import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../../../domain/roleRegistry";
import { openSqliteStore } from "./sqliteStore";
import { createWorkflowCoordinator } from "./workflowCoordinator";

const roots: string[] = [];
const uuid = (value: number) =>
  `${value.toString().padStart(8, "0")}-0000-4000-8000-000000000001`;
const hash = (value: number) => value.toString(16).padStart(64, "0");
const at = (second: number) =>
  `2026-07-23T00:00:${second.toString().padStart(2, "0")}.000Z`;

function setup() {
  const root = mkdtempSync(join(tmpdir(), "stocksembly-workflow-coordinator-"));
  roots.push(root);
  const databasePath = join(root, "workflow.sqlite");
  const store = openSqliteStore(databasePath);
  const runId = RunIdSchema.parse(uuid(1));
  const snapshotId = SnapshotIdSchema.parse(uuid(2));
  store.createRun({
    runId,
    snapshotId,
    requestedAt: at(0),
    initialJob: {
      jobId: JobIdSchema.parse(uuid(3)),
      kind: "research",
      logicalKey: "collect:mandatory",
      inputHash: hash(3),
      createdAt: at(0),
    },
    initialEvent: {
      eventId: EventIdSchema.parse(uuid(4)),
      type: "run_created",
      stateId: "created",
      occurredAt: at(0),
      payload: {
        schemaVersion: "workflow-v1",
        participantIds: [],
        claimIds: [],
        sourceIds: [],
        limitationIds: [],
        summary: { en: "Run created.", ko: "조사가 생성됐습니다." },
      },
    },
  });
  return { databasePath, store, runId };
}

function advanceBeforeMandate(
  coordinator: ReturnType<typeof createWorkflowCoordinator>,
  runId: string,
) {
  for (const [index, eventKind] of (
    [
      "collection_started",
      "evidence_cutoff_recorded",
      "snapshot_sealed",
    ] as const
  ).entries()) {
    expect(
      coordinator.appendSystemTransition({
        runId,
        eventId: EventIdSchema.parse(uuid(40 + index)),
        eventKind,
        occurredAt: at(index + 1),
        summary: { en: eventKind, ko: eventKind },
        nextJobs: [],
      }).kind,
    ).toBe("committed");
  }
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("durable WorkflowV1 SQLite coordinator", () => {
  it("atomically advances a system phase with its next jobs and public event", () => {
    // Given
    const fixture = setup();
    const coordinator = createWorkflowCoordinator({
      databasePath: fixture.databasePath,
    });
    const memos = WORKFLOW_V1_SPECIALIST_IDS.map((roleId, index) => ({
      jobId: JobIdSchema.parse(uuid(100 + index)),
      kind: "research" as const,
      logicalKey: `memo:${roleId}`,
      inputHash: hash(100 + index),
      createdAt: at(4),
    }));

    // When
    for (const [index, eventKind] of (
      [
        "collection_started",
        "evidence_cutoff_recorded",
        "snapshot_sealed",
        "mandate_sealed",
      ] as const
    ).entries()) {
      const result = coordinator.appendSystemTransition({
        runId: fixture.runId,
        eventId: EventIdSchema.parse(uuid(10 + index)),
        eventKind,
        occurredAt: at(index + 1),
        summary: { en: eventKind, ko: eventKind },
        nextJobs: eventKind === "mandate_sealed" ? memos : [],
      });
      expect(result.kind).toBe("committed");
    }

    // Then
    expect(fixture.store.findRun(fixture.runId)).toMatchObject({
      status: "running",
      lastEventSeq: 5,
    });
    expect(
      memos.every((job) => fixture.store.findJob(job.jobId) !== undefined),
    ).toBe(true);
    expect(coordinator.replay(fixture.runId)).toMatchObject({
      kind: "valid",
      progress: { step: 2, completedSteps: 1 },
    });
    coordinator.close();
    fixture.store.close();
  });

  it("rolls back both event and next jobs when one job conflicts", () => {
    // Given
    const fixture = setup();
    const coordinator = createWorkflowCoordinator({
      databasePath: fixture.databasePath,
    });
    advanceBeforeMandate(coordinator, fixture.runId);
    const memos = WORKFLOW_V1_SPECIALIST_IDS.map((roleId, index) => ({
      jobId: JobIdSchema.parse(index === 0 ? uuid(3) : uuid(200 + index)),
      kind: "research" as const,
      logicalKey: `memo:${roleId}`,
      inputHash: hash(200 + index),
      createdAt: at(4),
    }));

    // When / Then
    expect(() =>
      coordinator.appendSystemTransition({
        runId: fixture.runId,
        eventId: EventIdSchema.parse(uuid(80)),
        eventKind: "mandate_sealed",
        occurredAt: at(4),
        summary: { en: "Mandate sealed.", ko: "조사 지시를 확정했습니다." },
        nextJobs: memos,
      }),
    ).toThrow();
    expect(fixture.store.eventsAfter(fixture.runId, 0)).toHaveLength(4);
    expect(fixture.store.findRun(fixture.runId)?.lastEventSeq).toBe(4);
    coordinator.close();
    fixture.store.close();
  });

  it("fails closed when durable workflow events were inserted out of order", () => {
    const fixture = setup();
    fixture.store.appendRunEvent({
      runId: fixture.runId,
      event: {
        eventId: EventIdSchema.parse(uuid(90)),
        type: "snapshot_sealed",
        stateId: "snapshot_sealed",
        occurredAt: at(1),
        payload: {
          schemaVersion: "workflow-v1",
          participantIds: [],
          claimIds: [],
          sourceIds: [],
          limitationIds: [],
          summary: { en: "Invalid order.", ko: "잘못된 순서입니다." },
        },
      },
    });
    const coordinator = createWorkflowCoordinator({
      databasePath: fixture.databasePath,
    });

    expect(coordinator.replay(fixture.runId)).toEqual({
      kind: "invalid",
      reason: "event_order_invalid",
    });
    expect(
      coordinator.appendSystemTransition({
        runId: fixture.runId,
        eventId: EventIdSchema.parse(uuid(91)),
        eventKind: "collection_started",
        occurredAt: at(2),
        summary: { en: "Collection.", ko: "수집." },
        nextJobs: [],
      }),
    ).toEqual({ kind: "blocked", reason: "event_order_invalid" });
    coordinator.close();
    fixture.store.close();
  });

  it("rejects caller-selected jobs that do not match the transition contract", () => {
    // Given
    const fixture = setup();
    const coordinator = createWorkflowCoordinator({
      databasePath: fixture.databasePath,
    });
    advanceBeforeMandate(coordinator, fixture.runId);

    // When
    const result = coordinator.appendSystemTransition({
      runId: fixture.runId,
      eventId: EventIdSchema.parse(uuid(95)),
      eventKind: "mandate_sealed",
      occurredAt: at(4),
      summary: { en: "Mandate.", ko: "조사 지시." },
      nextJobs: [
        {
          jobId: JobIdSchema.parse(uuid(96)),
          kind: "research",
          logicalKey: "memo:caller-selected-role",
          inputHash: hash(96),
          createdAt: at(4),
        },
      ],
    });

    // Then
    expect(result).toEqual({ kind: "blocked", reason: "next_jobs_invalid" });
    expect(fixture.store.eventsAfter(fixture.runId, 0)).toHaveLength(4);
    expect(fixture.store.findJob(JobIdSchema.parse(uuid(96)))).toBeUndefined();
    coordinator.close();
    fixture.store.close();
  });

  it("never resurrects a cancelling run through a late phase transition", () => {
    // Given
    const fixture = setup();
    fixture.store.transitionRun({
      runId: fixture.runId,
      fromStatus: "queued",
      toStatus: "cancelling",
      nextJobs: [],
      event: {
        eventId: EventIdSchema.parse(uuid(97)),
        type: "cancellation_requested_internal",
        stateId: "cancelling",
        occurredAt: at(1),
      },
    });
    const coordinator = createWorkflowCoordinator({
      databasePath: fixture.databasePath,
    });

    // When
    const result = coordinator.appendSystemTransition({
      runId: fixture.runId,
      eventId: EventIdSchema.parse(uuid(98)),
      eventKind: "collection_started",
      occurredAt: at(2),
      summary: { en: "Collection.", ko: "수집." },
      nextJobs: [],
    });

    // Then
    expect(result).toEqual({ kind: "blocked", reason: "run_state_invalid" });
    expect(fixture.store.findRun(fixture.runId)?.status).toBe("cancelling");
    coordinator.close();
    fixture.store.close();
  });

  it("replays workflow events across interleaved durable job events", () => {
    // Given
    const fixture = setup();
    const coordinator = createWorkflowCoordinator({
      databasePath: fixture.databasePath,
    });
    expect(
      coordinator.appendSystemTransition({
        runId: fixture.runId,
        eventId: EventIdSchema.parse(uuid(300)),
        eventKind: "collection_started",
        occurredAt: at(1),
        summary: { en: "Collection.", ko: "수집." },
        nextJobs: [],
      }).kind,
    ).toBe("committed");
    fixture.store.appendRunEvent({
      runId: fixture.runId,
      event: {
        eventId: EventIdSchema.parse(uuid(301)),
        type: "job_internal_checkpoint",
        stateId: "running",
        occurredAt: at(2),
      },
    });

    // When
    const result = coordinator.appendSystemTransition({
      runId: fixture.runId,
      eventId: EventIdSchema.parse(uuid(302)),
      eventKind: "evidence_cutoff_recorded",
      occurredAt: at(3),
      summary: { en: "Cutoff.", ko: "마감." },
      nextJobs: [],
    });

    // Then
    expect(result).toEqual({ kind: "committed", sequence: 4 });
    expect(coordinator.replay(fixture.runId)).toMatchObject({
      kind: "valid",
      events: [{ sequence: 1 }, { sequence: 2 }, { sequence: 4 }],
    });
    coordinator.close();
    fixture.store.close();
  });
});

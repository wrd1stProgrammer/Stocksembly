import { describe, expect, it } from "vitest";
import { createEventLedger } from "./eventState";
import {
  createJobRecord,
  createLaunchLedger,
  createLease,
  JOB_STATUS,
  reserveSpawnOrdinal,
  transitionJob,
} from "./jobState";
import {
  canTransitionRun,
  createRunRecord,
  RUN_STATUS,
  RUN_TRANSITIONS,
  type RunRecord,
  RunRecordSchema,
  type RunStatus,
  transitionRun,
} from "./runState";

const runId = "00000000-0000-4000-8000-000000000001";
const snapshotId = "00000000-0000-4000-8000-000000000002";
const reportId = "00000000-0000-4000-8000-000000000003";
const now = "2026-07-22T00:00:00.000Z";
const EXPECTED_RUN_TRANSITIONS: Readonly<{
  [status in RunStatus]: readonly RunStatus[];
}> = {
  queued: [
    RUN_STATUS.running,
    RUN_STATUS.cancelling,
    RUN_STATUS.cancelled,
    RUN_STATUS.failed,
  ],
  running: [
    RUN_STATUS.cancelling,
    RUN_STATUS.completed,
    RUN_STATUS.completeWithLimitations,
    RUN_STATUS.failed,
    RUN_STATUS.incomplete,
  ],
  cancelling: [RUN_STATUS.cancelled, RUN_STATUS.failed],
  completed: [],
  "complete-with-limitations": [],
  cancelled: [],
  failed: [],
  incomplete: [],
};

function queuedRun(): RunRecord {
  return createRunRecord({
    runId,
    snapshotId,
    createdAt: now,
  });
}

describe("durable run state", () => {
  it("walks queued to report-published completion with one atomic next-job/event result", () => {
    const queued = queuedRun();

    const started = transitionRun(queued, RUN_STATUS.running, {
      now,
      eventLedger: createEventLedger(runId),
      nextJobs: [{ kind: "collect-evidence", logicalKey: "identity" }],
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const completed = transitionRun(started.state, RUN_STATUS.completed, {
      now,
      eventLedger: started.eventLedger,
      report: { reportId, publishedAt: now },
    });

    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.state.status).toBe(RUN_STATUS.completed);
    expect(completed.state.reportId).toBe(reportId);
    expect(completed.transaction.committed).toBe(true);
    expect(completed.transaction.eventLedger).toBe(completed.eventLedger);
    expect(completed.transaction.nextJobs).toEqual([]);
    expect(completed.transaction.event.type).toBe("report_published");
  });

  it("rejects completion without report publication and preserves the prior state", () => {
    const running = transitionRun(queuedRun(), RUN_STATUS.running, {
      now,
      eventLedger: createEventLedger(runId),
    });
    expect(running.ok).toBe(true);
    if (!running.ok) return;

    const result = transitionRun(running.state, RUN_STATUS.completed, {
      now,
      eventLedger: running.eventLedger,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("report_required");
    expect(running.state.status).toBe(RUN_STATUS.running);
  });

  it("enforces terminal immutability and cancellation legality", () => {
    const running = transitionRun(queuedRun(), RUN_STATUS.running, {
      now,
      eventLedger: createEventLedger(runId),
    });
    expect(running.ok).toBe(true);
    if (!running.ok) return;
    const completed = transitionRun(running.state, RUN_STATUS.completed, {
      now,
      eventLedger: running.eventLedger,
      report: { reportId, publishedAt: now },
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    const result = transitionRun(completed.state, RUN_STATUS.cancelling, {
      now,
      eventLedger: completed.eventLedger,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("terminal_immutable");
  });

  it("requires the cancelling phase before a running run can become cancelled", () => {
    const running = transitionRun(queuedRun(), RUN_STATUS.running, {
      now,
      eventLedger: createEventLedger(runId),
    });
    expect(running.ok).toBe(true);
    if (!running.ok) return;
    const result = transitionRun(running.state, RUN_STATUS.cancelled, {
      now,
      eventLedger: running.eventLedger,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("illegal_transition");
  });

  it("creates same-snapshot retry and new-snapshot follow-up lineage without mutating the parent", () => {
    const running = transitionRun(queuedRun(), RUN_STATUS.running, {
      now,
      eventLedger: createEventLedger(runId),
    });
    expect(running.ok).toBe(true);
    if (!running.ok) return;
    const parent = transitionRun(
      running.state,
      RUN_STATUS.completeWithLimitations,
      {
        now,
        eventLedger: running.eventLedger,
        report: { reportId, publishedAt: now },
      },
    );
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    const retry = parent.state.child({
      kind: "same-snapshot-retry",
      childRunId: "00000000-0000-4000-8000-000000000004",
    });
    const followUp = parent.state.child({
      kind: "new-snapshot-follow-up",
      childRunId: "00000000-0000-4000-8000-000000000005",
      snapshotId: "00000000-0000-4000-8000-000000000006",
    });

    expect(retry.ok).toBe(true);
    expect(followUp.ok).toBe(true);
    if (!retry.ok || !followUp.ok) return;
    if (
      retry.state.lineage === undefined ||
      followUp.state.lineage === undefined
    )
      return;
    expect(retry.state.lineage.kind).toBe("same-snapshot-retry");
    expect(retry.state.snapshotId).toBe(parent.state.snapshotId);
    expect(followUp.state.lineage.kind).toBe("new-snapshot-follow-up");
    expect(followUp.state.snapshotId).not.toBe(parent.state.snapshotId);
    expect(parent.state.lineage).toBeUndefined();
  });

  it("rejects report fields on non-publishable durable run states", () => {
    const contradictory = RunRecordSchema.safeParse({
      runId,
      snapshotId,
      status: RUN_STATUS.failed,
      createdAt: now,
      eventSeq: 1,
      reportId,
      reportPublishedAt: now,
    });
    expect(contradictory.success).toBe(false);
  });

  it("allocates run-start, spawn, and terminal events from one authoritative ledger", () => {
    const started = transitionRun(queuedRun(), RUN_STATUS.running, {
      now,
      eventLedger: createEventLedger(runId),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.event.sequence).toBe(1);

    const job = createJobRecord({
      jobId: "00000000-0000-4000-8000-000000000010",
      runId,
      snapshotId,
      kind: "research",
      logicalKey: "memo:interleave",
      createdAt: now,
    });
    const lease = createLease({
      owner: "worker-interleave",
      token: 20,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const leased = transitionJob(job, JOB_STATUS.leased, {
      now,
      lease,
      leaseOwner: lease.owner,
      leaseToken: lease.token,
    });
    expect(leased.ok).toBe(true);
    if (!leased.ok) return;
    const reserved = reserveSpawnOrdinal(
      leased.state,
      createLaunchLedger("research"),
      {
        attemptId: "00000000-0000-4000-8000-000000000011",
        now,
        lease,
        eventLedger: started.eventLedger,
      },
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.event.sequence).toBe(2);

    const completed = transitionRun(started.state, RUN_STATUS.completed, {
      now,
      eventLedger: reserved.eventLedger,
      report: { reportId, publishedAt: now },
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.event.sequence).toBe(3);
    expect(completed.state.eventSeq).toBe(3);
    expect(completed.eventLedger.events.map((event) => event.sequence)).toEqual(
      [1, 2, 3],
    );
    expect(
      new Set(completed.eventLedger.events.map((event) => event.id)).size,
    ).toBe(3);
  });

  it("keeps research and QA job events interleaved with run events", () => {
    const started = transitionRun(queuedRun(), RUN_STATUS.running, {
      now,
      eventLedger: createEventLedger(runId),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const researchLease = createLease({
      owner: "worker-interleave",
      token: 21,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const research = transitionJob(
      createJobRecord({
        jobId: "00000000-0000-4000-8000-000000000020",
        runId,
        snapshotId,
        kind: "research",
        logicalKey: "memo:research",
        createdAt: now,
      }),
      JOB_STATUS.leased,
      {
        now,
        lease: researchLease,
        leaseOwner: researchLease.owner,
        leaseToken: researchLease.token,
      },
    );
    expect(research.ok).toBe(true);
    if (!research.ok) return;
    const first = reserveSpawnOrdinal(
      research.state,
      createLaunchLedger("research"),
      {
        attemptId: "00000000-0000-4000-8000-000000000021",
        now,
        lease: researchLease,
        eventLedger: started.eventLedger,
      },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const qaLease = createLease({
      owner: "worker-interleave",
      token: 22,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const qa = transitionJob(
      createJobRecord({
        jobId: "00000000-0000-4000-8000-000000000022",
        runId,
        snapshotId,
        kind: "qa",
        logicalKey: "question:qa",
        createdAt: now,
      }),
      JOB_STATUS.leased,
      {
        now,
        lease: qaLease,
        leaseOwner: qaLease.owner,
        leaseToken: qaLease.token,
      },
    );
    expect(qa.ok).toBe(true);
    if (!qa.ok) return;
    const second = reserveSpawnOrdinal(qa.state, createLaunchLedger("qa"), {
      attemptId: "00000000-0000-4000-8000-000000000023",
      now,
      lease: qaLease,
      eventLedger: first.eventLedger,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const completed = transitionRun(started.state, RUN_STATUS.completed, {
      now,
      eventLedger: second.eventLedger,
      report: { reportId, publishedAt: now },
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.eventLedger.events.map((event) => event.sequence)).toEqual(
      [1, 2, 3, 4],
    );
    expect(
      new Set(completed.eventLedger.events.map((event) => event.id)).size,
    ).toBe(4);
    expect(completed.event.type).toBe("report_published");
  });

  it("checks every run transition pair against the durable table", () => {
    const statuses = Object.keys(EXPECTED_RUN_TRANSITIONS) as RunStatus[];
    for (const from of statuses)
      for (const to of statuses) {
        const expected = EXPECTED_RUN_TRANSITIONS[from];
        expect(RUN_TRANSITIONS[from]).toEqual(expected);
        expect(canTransitionRun(from, to)).toBe(expected.includes(to));
      }
  });
});

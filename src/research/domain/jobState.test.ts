import { describe, expect, it } from "vitest";
import { createEventLedger } from "./eventState";
import { JobIdSchema } from "./ids";
import type { JobStatus } from "./jobState";
import {
  AttemptSchema,
  canTransitionJob,
  createJobRecord,
  createLaunchLedger,
  createLease,
  JOB_STATUS,
  JOB_TRANSITIONS,
  JobRecordSchema,
  renewLease,
  reserveSpawnOrdinal,
  transitionJob,
  uncertainSpawnRecovery,
} from "./jobState";

const runId = "00000000-0000-4000-8000-000000000011";
const snapshotId = "00000000-0000-4000-8000-000000000012";
const jobId = "00000000-0000-4000-8000-000000000013";
const attemptId = "00000000-0000-4000-8000-000000000014";
const now = "2026-07-22T00:00:00.000Z";
const EXPECTED_JOB_TRANSITIONS: Readonly<{
  [status in JobStatus]: readonly JobStatus[];
}> = {
  queued: [
    JOB_STATUS.leased,
    JOB_STATUS.cancelRequested,
    JOB_STATUS.cancelled,
    JOB_STATUS.failed,
  ],
  leased: [
    JOB_STATUS.leased,
    JOB_STATUS.spawnReserved,
    JOB_STATUS.queued,
    JOB_STATUS.cancelRequested,
    JOB_STATUS.cancelled,
    JOB_STATUS.failed,
  ],
  "spawn-reserved": [
    JOB_STATUS.running,
    JOB_STATUS.retryWait,
    JOB_STATUS.cancelRequested,
    JOB_STATUS.cancelled,
    JOB_STATUS.failed,
  ],
  running: [
    JOB_STATUS.retryWait,
    JOB_STATUS.cancelRequested,
    JOB_STATUS.succeeded,
    JOB_STATUS.failed,
  ],
  "retry-wait": [JOB_STATUS.leased, JOB_STATUS.cancelled, JOB_STATUS.failed],
  "cancel-requested": [JOB_STATUS.cancelled, JOB_STATUS.failed],
  cancelled: [],
  succeeded: [],
  failed: [],
};

describe("durable job, attempt, lease, and launch state", () => {
  it("fences a lease, reserves a burned ordinal, and renews reserved/running leases", () => {
    const job = createJobRecord({
      jobId,
      runId,
      snapshotId,
      kind: "research",
      logicalKey: "memo:maya",
      createdAt: now,
    });
    const lease = createLease({
      owner: "worker-a",
      token: 1,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const leased = transitionJob(job, JOB_STATUS.leased, {
      now,
      lease,
      leaseOwner: "worker-a",
      leaseToken: 1,
    });
    expect(leased.ok).toBe(true);
    if (!leased.ok) return;

    const reserved = reserveSpawnOrdinal(
      leased.state,
      createLaunchLedger("research"),
      { attemptId, now, lease, eventLedger: createEventLedger(runId) },
    );

    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.ledger.nextOrdinal).toBe(2);
    expect(reserved.ledger.entries[0]?.ordinal).toBe(1);
    expect(reserved.job.status).toBe(JOB_STATUS.spawnReserved);
    expect(reserved.attempt.ordinal).toBe(1);
    expect(reserved.attempt.ordinalState).toBe("burned");
    expect(reserved.attempt.immutable).toBe(true);
    expect(reserved.transaction.ledger).toBe(reserved.ledger);
    expect(reserved.transaction.event.type).toBe("spawn_reserved");
    expect(reserved.transaction.event.ordinal).toBe(1);
    expect(reserved.transaction.nextJobs).toEqual([reserved.job]);
    const reservedRenewed = renewLease(reserved.job, {
      owner: "worker-a",
      token: 1,
      now,
      expiresAt: "2026-07-22T00:02:00.000Z",
    });
    expect(reservedRenewed.ok).toBe(true);
    if (!reservedRenewed.ok) return;
    const running = transitionJob(reservedRenewed.state, JOB_STATUS.running, {
      now,
      leaseOwner: "worker-a",
      leaseToken: 1,
    });
    expect(running.ok).toBe(true);
    if (!running.ok) return;
    const runningRenewed = renewLease(running.state, {
      owner: "worker-a",
      token: 1,
      now,
      expiresAt: "2026-07-22T00:03:00.000Z",
    });
    expect(runningRenewed.ok).toBe(true);

    const recovered = uncertainSpawnRecovery(
      reserved.job,
      reserved.attempt,
      reserved.ledger,
    );
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.attempt.id).toBe(attemptId);
    expect(recovered.canRelaunchSameAttempt).toBe(false);
    expect(recovered.attempt).toBe(reserved.attempt);
    expect(reserved.attempt.status).toBe(JOB_STATUS.spawnReserved);
    const reuse = reserveSpawnOrdinal(recovered.job, reserved.ledger, {
      attemptId,
      now,
      lease,
      eventLedger: reserved.eventLedger,
    });
    expect(reuse.ok).toBe(false);
    if (reuse.ok) return;
    expect(reuse.error.kind).toBe("illegal_transition");
  });

  it("does not permit a worker to skip the durable spawn reservation", () => {
    const job = createJobRecord({
      jobId,
      runId,
      snapshotId,
      kind: "research",
      logicalKey: "memo:maya",
      createdAt: now,
    });
    const lease = createLease({
      owner: "worker-a",
      token: 1,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const leased = transitionJob(job, JOB_STATUS.leased, {
      now,
      lease,
      leaseOwner: "worker-a",
      leaseToken: 1,
    });
    expect(leased.ok).toBe(true);
    if (!leased.ok) return;
    const skipped = transitionJob(leased.state, JOB_STATUS.running, {
      now,
      leaseOwner: "worker-a",
      leaseToken: 1,
    });
    expect(skipped.ok).toBe(false);
    if (skipped.ok) return;
    expect(skipped.error.kind).toBe("illegal_transition");
  });

  it("rejects stale-lease commits, duplicate terminal transitions, and illegal cancellation", () => {
    const job = createJobRecord({
      jobId,
      runId,
      snapshotId,
      kind: "qa",
      logicalKey: "question:one",
      createdAt: now,
    });
    const lease = createLease({
      owner: "worker-a",
      token: 3,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const leased = transitionJob(job, JOB_STATUS.leased, {
      now,
      lease,
      leaseOwner: "worker-a",
      leaseToken: 3,
    });
    expect(leased.ok).toBe(true);
    if (!leased.ok) return;
    const reserved = reserveSpawnOrdinal(
      leased.state,
      createLaunchLedger("qa"),
      {
        attemptId: "00000000-0000-4000-8000-000000000019",
        now,
        lease,
        eventLedger: createEventLedger(runId),
      },
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;

    const stale = transitionJob(reserved.job, JOB_STATUS.running, {
      now,
      leaseOwner: "worker-a",
      leaseToken: 2,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.kind).toBe("stale_lease");

    const running = transitionJob(reserved.job, JOB_STATUS.running, {
      now,
      leaseOwner: "worker-a",
      leaseToken: 3,
    });
    expect(running.ok).toBe(true);
    if (!running.ok) return;
    const directCancellation = transitionJob(
      running.state,
      JOB_STATUS.cancelled,
      {
        now,
        leaseOwner: "worker-a",
        leaseToken: 3,
      },
    );
    expect(directCancellation.ok).toBe(false);
    if (directCancellation.ok) return;
    expect(directCancellation.error.kind).toBe("illegal_transition");
    const succeeded = transitionJob(running.state, JOB_STATUS.succeeded, {
      now,
      leaseOwner: "worker-a",
      leaseToken: 3,
      resultArtifactId: "00000000-0000-4000-8000-000000000015",
    });
    expect(succeeded.ok).toBe(true);
    if (!succeeded.ok) return;
    const duplicateTerminal = transitionJob(
      succeeded.state,
      JOB_STATUS.failed,
      {
        now,
        leaseOwner: "worker-a",
        leaseToken: 3,
      },
    );
    expect(duplicateTerminal.ok).toBe(false);
    if (duplicateTerminal.ok) return;
    expect(duplicateTerminal.error.kind).toBe("terminal_immutable");
  });

  it("requires distinct lineage for same-snapshot retries and new-snapshot follow-ups", () => {
    const job = createJobRecord({
      jobId,
      runId,
      snapshotId,
      kind: "research",
      logicalKey: "memo:maya",
      createdAt: now,
    });
    const terminal = transitionJob(job, JOB_STATUS.failed, { now });
    expect(terminal.ok).toBe(true);
    if (!terminal.ok) return;
    const retry = terminal.state.retry({
      attemptId: "00000000-0000-4000-8000-000000000016",
      kind: "same-snapshot-retry",
    });
    const followUp = terminal.state.retry({
      attemptId: "00000000-0000-4000-8000-000000000017",
      kind: "new-snapshot-follow-up",
      snapshotId: "00000000-0000-4000-8000-000000000018",
    });

    expect(retry.ok).toBe(true);
    expect(followUp.ok).toBe(true);
    if (!retry.ok || !followUp.ok) return;
    if (retry.job.lineage === undefined || followUp.job.lineage === undefined)
      return;
    expect(retry.job.lineage.kind).toBe("same-snapshot-retry");
    expect(retry.job.snapshotId).toBe(snapshotId);
    expect(followUp.job.lineage.kind).toBe("new-snapshot-follow-up");
    expect(followUp.job.snapshotId).not.toBe(snapshotId);
  });

  it("renews a leased job only for the current owner/token and a later expiry", () => {
    const job = createJobRecord({
      jobId,
      runId,
      snapshotId,
      kind: "research",
      logicalKey: "memo:maya",
      createdAt: now,
    });
    const lease = createLease({
      owner: "worker-a",
      token: 7,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const leased = transitionJob(job, JOB_STATUS.leased, {
      now,
      lease,
      leaseOwner: "worker-a",
      leaseToken: 7,
    });
    expect(leased.ok).toBe(true);
    if (!leased.ok) return;

    const renewed = renewLease(leased.state, {
      owner: "worker-a",
      token: 7,
      now,
      expiresAt: "2026-07-22T00:02:00.000Z",
    });
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    expect(renewed.state.status).toBe(JOB_STATUS.leased);
    expect(renewed.state.lease?.expiresAt).toBe("2026-07-22T00:02:00.000Z");
    const renewedByTransition = transitionJob(leased.state, JOB_STATUS.leased, {
      now,
      lease: createLease({
        owner: "worker-a",
        token: 7,
        expiresAt: "2026-07-22T00:02:00.000Z",
      }),
      leaseOwner: "worker-a",
      leaseToken: 7,
    });
    expect(renewedByTransition.ok).toBe(true);

    const stale = renewLease(renewed.state, {
      owner: "worker-a",
      token: 6,
      now,
      expiresAt: "2026-07-22T00:03:00.000Z",
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.kind).toBe("stale_lease");

    const foreign = renewLease(renewed.state, {
      owner: "worker-b",
      token: 7,
      now,
      expiresAt: "2026-07-22T00:03:00.000Z",
    });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.error.kind).toBe("stale_lease");

    const backwards = renewLease(renewed.state, {
      owner: "worker-a",
      token: 7,
      now,
      expiresAt: "2026-07-22T00:01:30.000Z",
    });
    expect(backwards.ok).toBe(false);
    if (backwards.ok) return;
    expect(backwards.error.kind).toBe("invalid_lease");
  });

  it("rejects invalid lease clocks, forged attempts, contradictory states, and queued retries", () => {
    const job = createJobRecord({
      jobId,
      runId,
      snapshotId,
      kind: "research",
      logicalKey: "memo:maya",
      createdAt: now,
    });
    const lease = createLease({
      owner: "worker-a",
      token: 8,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const leased = transitionJob(job, JOB_STATUS.leased, {
      now,
      lease,
      leaseOwner: "worker-a",
      leaseToken: 8,
    });
    expect(leased.ok).toBe(true);
    if (!leased.ok) return;
    const invalidNow = transitionJob(leased.state, JOB_STATUS.queued, {
      now: "not-a-timestamp",
      leaseOwner: "worker-a",
      leaseToken: 8,
    });
    expect(invalidNow.ok).toBe(false);

    const retry = job.retry({
      attemptId: "00000000-0000-4000-8000-000000000039",
      kind: "same-snapshot-retry",
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.error.kind).toBe("invalid_lineage");

    const reserved = reserveSpawnOrdinal(
      leased.state,
      createLaunchLedger("research"),
      {
        attemptId: "00000000-0000-4000-8000-000000000040",
        now,
        lease,
        eventLedger: createEventLedger(runId),
      },
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const forged = uncertainSpawnRecovery(
      reserved.job,
      {
        ...reserved.attempt,
        jobId: JobIdSchema.parse("00000000-0000-4000-8000-000000000041"),
      },
      reserved.ledger,
    );
    expect(forged.ok).toBe(false);
    const forgedOrdinal = uncertainSpawnRecovery(
      reserved.job,
      { ...reserved.attempt, ordinal: 999 },
      reserved.ledger,
    );
    expect(forgedOrdinal.ok).toBe(false);

    const contradictoryJob = JobRecordSchema.safeParse({
      ...job,
      status: JOB_STATUS.running,
    });
    expect(contradictoryJob.success).toBe(false);
    const queuedWithAttempt = JobRecordSchema.safeParse({
      ...job,
      attemptId,
      resultArtifactId: "00000000-0000-4000-8000-000000000042",
    });
    expect(queuedWithAttempt.success).toBe(false);
    const contradictoryAttempt = AttemptSchema.safeParse({
      id: attemptId,
      jobId,
      runId,
      snapshotId,
      kind: "research",
      status: JOB_STATUS.spawnReserved,
      ordinalState: "burned",
      immutable: true,
      createdAt: now,
    });
    expect(contradictoryAttempt.success).toBe(false);
  });

  it("checks every job transition pair against the durable table", () => {
    const statuses = Object.keys(EXPECTED_JOB_TRANSITIONS) as JobStatus[];
    for (const from of statuses)
      for (const to of statuses) {
        const expected = EXPECTED_JOB_TRANSITIONS[from];
        expect(JOB_TRANSITIONS[from]).toEqual(expected);
        expect(canTransitionJob(from, to)).toBe(expected.includes(to));
      }
  });

  it("uses one per-run event ledger for research and QA spawn reservations", () => {
    const eventLedger = createEventLedger(runId);
    const research = createJobRecord({
      jobId,
      runId,
      snapshotId,
      kind: "research",
      logicalKey: "memo:maya",
      createdAt: now,
    });
    const researchLease = createLease({
      owner: "worker-a",
      token: 11,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const leasedResearch = transitionJob(research, JOB_STATUS.leased, {
      now,
      lease: researchLease,
      leaseOwner: "worker-a",
      leaseToken: 11,
    });
    expect(leasedResearch.ok).toBe(true);
    if (!leasedResearch.ok) return;
    const first = reserveSpawnOrdinal(
      leasedResearch.state,
      createLaunchLedger("research"),
      {
        attemptId: "00000000-0000-4000-8000-000000000043",
        now,
        lease: researchLease,
        eventLedger,
      },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const qa = createJobRecord({
      jobId: "00000000-0000-4000-8000-000000000044",
      runId,
      snapshotId,
      kind: "qa",
      logicalKey: "question:one",
      createdAt: now,
    });
    const qaLease = createLease({
      owner: "worker-a",
      token: 12,
      expiresAt: "2026-07-22T00:01:00.000Z",
    });
    const leasedQa = transitionJob(qa, JOB_STATUS.leased, {
      now,
      lease: qaLease,
      leaseOwner: "worker-a",
      leaseToken: 12,
    });
    expect(leasedQa.ok).toBe(true);
    if (!leasedQa.ok) return;
    const second = reserveSpawnOrdinal(
      leasedQa.state,
      createLaunchLedger("qa"),
      {
        attemptId: "00000000-0000-4000-8000-000000000045",
        now,
        lease: qaLease,
        eventLedger: first.eventLedger,
      },
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(first.event.sequence).toBe(1);
    expect(second.event.sequence).toBe(2);
    expect(second.event.id).not.toBe(first.event.id);
  });
});

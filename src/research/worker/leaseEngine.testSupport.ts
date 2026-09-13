import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { createResearchTestDatabase } from "../../test/researchPostgres";
import {
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import { findAttempt } from "../server/persistence/postgres/attemptRepository";
import { leaseJob } from "../server/persistence/postgres/leaseRepository";
import {
  createRun,
  findRun,
  transitionRun,
} from "../server/persistence/postgres/runRepository";
import {
  type AttemptHandler,
  type AttemptOutcome,
  createLeaseEngine,
  type LeaseEngine,
  type WorkerAttempt,
  type WorkerClock,
  type WorkerIdentityFactory,
} from "./leaseEngine";
import {
  type QuestionSeed,
  seedQuestion,
} from "./leaseEngineQuestion.testSupport";

export function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

export function hash(value: number): string {
  return createHash("sha256").update(String(value)).digest("hex");
}

export class ManualWorkerClock implements WorkerClock {
  constructor(private timestamp = "2026-07-22T00:00:00.000Z") {}

  now(): string {
    return this.timestamp;
  }

  set(timestamp: string): void {
    this.timestamp = timestamp;
  }
}

export class RecordingHandler implements AttemptHandler {
  readonly attempts: WorkerAttempt[] = [];
  outcome: AttemptOutcome = { kind: "accepted" };
  gate?: Promise<void>;

  async run(attempt: WorkerAttempt): Promise<AttemptOutcome> {
    this.attempts.push(attempt);
    await this.gate;
    return this.outcome;
  }
}

type Seed = {
  readonly runId: ReturnType<typeof RunIdSchema.parse>;
  readonly snapshotId: ReturnType<typeof SnapshotIdSchema.parse>;
  readonly jobId: ReturnType<typeof JobIdSchema.parse>;
};

export class LeaseEngineFixture {
  readonly directory = mkdtempSync(join(tmpdir(), "stocksembly-worker-"));
  readonly clock = new ManualWorkerClock();
  readonly handler = new RecordingHandler();
  #identity = 800_000;
  #seed = 1;
  #started = 0;
  readonly #startWaiters: Array<{ count: number; resolve: () => void }> = [];

  waitForStarts(count = 1): Promise<void> {
    if (this.#started >= count) return Promise.resolve();
    return new Promise((resolve) =>
      this.#startWaiters.push({ count, resolve }),
    );
  }

  constructor(
    readonly pool: Pool,
    private readonly closeDatabase: () => Promise<void>,
  ) {}

  openEngine(
    ownerId: string,
    handler: AttemptHandler = this.handler,
    options: { readonly retryRandom?: () => number } = {},
  ): LeaseEngine {
    const identities: WorkerIdentityFactory = {
      attemptId: () => AttemptIdSchema.parse(uuid(this.#identity++)),
      eventId: () => EventIdSchema.parse(uuid(this.#identity++)),
    };
    return createLeaseEngine({
      pool: this.pool,
      ownerId,
      handler: {
        ...handler,
        run: (...args: Parameters<AttemptHandler["run"]>) => {
          const result = handler.run(...args);
          this.#started += 1;
          for (const waiter of this.#startWaiters)
            if (this.#started >= waiter.count) waiter.resolve();
          return result;
        },
      },
      clock: this.clock,
      identities,
      ...(options.retryRandom === undefined
        ? {}
        : { retryRandom: options.retryRandom }),
    });
  }

  async seedResearchJob(
    value = this.#seed++,
    budget?: {
      readonly remainingBaseCalls: number;
      readonly requestedOptionalCalls: number;
      readonly requestedReplacementCalls: number;
    },
  ): Promise<Seed> {
    const base = value * 100;
    const seed = {
      runId: RunIdSchema.parse(uuid(base + 1)),
      snapshotId: SnapshotIdSchema.parse(uuid(base + 2)),
      jobId: JobIdSchema.parse(uuid(base + 3)),
    };
    await createRun(this.pool, {
      runId: seed.runId,
      snapshotId: seed.snapshotId,
      requestedAt: this.clock.now(),
      initialJob: {
        jobId: seed.jobId,
        kind: "research",
        logicalKey: `memo:${value}`,
        inputHash: hash(value),
        createdAt: this.clock.now(),
      },
      initialEvent: {
        eventId: EventIdSchema.parse(uuid(base + 4)),
        type: "run_queued",
        stateId: "queued",
        occurredAt: this.clock.now(),
      },
      ...budget,
    });
    return seed;
  }

  async seedResearchJobs(
    count: number,
    value = this.#seed++,
    budget?: {
      readonly remainingBaseCalls: number;
      readonly requestedOptionalCalls: number;
      readonly requestedReplacementCalls: number;
    },
  ): Promise<readonly Seed[]> {
    const first = await this.seedResearchJob(value, budget);
    const jobs = [first];
    for (let index = 1; index < count; index += 1) {
      jobs.push({
        runId: first.runId,
        snapshotId: first.snapshotId,
        jobId: JobIdSchema.parse(uuid(value * 100 + index + 10)),
      });
    }
    if (jobs.length > 1) {
      await transitionRun(this.pool, {
        runId: first.runId,
        fromStatus: "queued",
        toStatus: "running",
        nextJobs: jobs.slice(1).map((job, index) => ({
          jobId: job.jobId,
          kind: "research" as const,
          logicalKey: `memo:${value}:${index + 1}`,
          inputHash: hash(value * 1_000 + index + 1),
          createdAt: this.clock.now(),
        })),
        event: {
          eventId: EventIdSchema.parse(uuid(value * 100 + 90)),
          type: "run_started",
          stateId: "running",
          occurredAt: this.clock.now(),
        },
      });
    }
    return jobs;
  }

  seedQuestionJob(value = this.#seed++): Promise<QuestionSeed> {
    return seedQuestion(this.pool, this.clock, value);
  }

  async leaseOnly(
    jobId: string,
    ownerId: string,
    expiresAt: string,
  ): Promise<number> {
    const lease = await leaseJob(this.pool, {
      jobId: JobIdSchema.parse(jobId),
      ownerId,
      now: this.clock.now(),
      expiresAt,
    });
    if (!lease) throw new RangeError("lease fixture missing");
    return lease.token;
  }
  async launches(
    runId?: string,
  ): Promise<readonly { ordinal: number; attempt_id: string }[]> {
    return (
      await this.pool.query<{ ordinal: number; attempt_id: string }>(
        `SELECT ordinal, attempt_id FROM research_call_ordinals ${runId === undefined ? "" : "WHERE run_id=$1"} ORDER BY run_id, ordinal`,
        runId === undefined ? [] : [runId],
      )
    ).rows;
  }
  async job(jobId: string) {
    const row = (
      await this.pool.query<{
        status: string;
        lease_token: number;
        lease_expires_at: string | null;
      }>(
        "SELECT status, lease_token, lease_expires_at FROM jobs WHERE job_id=$1",
        [jobId],
      )
    ).rows[0];
    if (!row) throw new RangeError("job fixture missing");
    return row;
  }
  async runStatus(runId: string): Promise<string> {
    const row = (
      await this.pool.query<{ status: string }>(
        "SELECT status FROM runs WHERE run_id=$1",
        [runId],
      )
    ).rows[0];
    if (!row) throw new RangeError("run fixture missing");
    return row.status;
  }
  async failResearchJobsWithoutTerminalEvent(runId: string): Promise<void> {
    await this.pool.query(
      "UPDATE jobs SET status='failed', lease_owner=NULL, lease_expires_at=NULL WHERE run_id=$1 AND kind='research'",
      [runId],
    );
  }
  async eventCount(runId: string, type: string): Promise<number> {
    return (
      (
        await this.pool.query<{ count: number }>(
          "SELECT COUNT(*)::integer AS count FROM run_events WHERE run_id=$1 AND event_type=$2",
          [runId, type],
        )
      ).rows[0]?.count ?? 0
    );
  }
  async eventPayload(runId: string, type: string): Promise<unknown> {
    const row = (
      await this.pool.query<{ payload_json: string }>(
        "SELECT payload_json FROM run_events WHERE run_id=$1 AND event_type=$2 ORDER BY sequence DESC LIMIT 1",
        [runId, type],
      )
    ).rows[0];
    return row ? JSON.parse(row.payload_json) : undefined;
  }
  run(runId: string) {
    return findRun(this.pool, runId);
  }
  async completeRun(runId: string, eventId: string): Promise<void> {
    await transitionRun(this.pool, {
      runId: RunIdSchema.parse(runId),
      fromStatus: "running",
      toStatus: "completed",
      nextJobs: [],
      event: {
        eventId: EventIdSchema.parse(eventId),
        type: "report_published",
        stateId: "completed",
        occurredAt: this.clock.now(),
      },
    });
  }
  async limitations(runId: string): Promise<readonly string[]> {
    return (
      await this.pool.query<{ code: string }>(
        "SELECT code FROM run_public_limitations WHERE run_id=$1 ORDER BY code",
        [runId],
      )
    ).rows.map((row) => row.code);
  }
  async budgets(runId: string) {
    const row = (
      await this.pool.query<{
        remaining_base_calls: number;
        requested_replacement_calls: number;
      }>(
        "SELECT remaining_base_calls,requested_replacement_calls FROM runs WHERE run_id=$1",
        [runId],
      )
    ).rows[0];
    if (!row) throw new RangeError("run budget fixture missing");
    return {
      remainingBaseCalls: row.remaining_base_calls,
      requestedReplacementCalls: row.requested_replacement_calls,
    };
  }
  async runtimeStates(runId: string): Promise<readonly string[]> {
    return (
      await this.pool.query<{ state_id: string }>(
        "SELECT state_id FROM run_events WHERE run_id=$1 AND event_type='runtime_status' ORDER BY sequence",
        [runId],
      )
    ).rows.map((row) => row.state_id);
  }
  async attemptCommittedPayloads(runId: string): Promise<readonly unknown[]> {
    return (
      await this.pool.query<{ payload_json: string }>(
        "SELECT payload_json FROM run_events WHERE run_id=$1 AND event_type='attempt_committed' ORDER BY sequence",
        [runId],
      )
    ).rows.map((row) => JSON.parse(row.payload_json));
  }
  attempt(attemptId: string) {
    return findAttempt(this.pool, attemptId);
  }
  async questionStatus(questionId: string): Promise<string> {
    const row = (
      await this.pool.query<{ status: string }>(
        "SELECT status FROM questions WHERE question_id=$1",
        [questionId],
      )
    ).rows[0];
    if (!row) throw new RangeError("question fixture missing");
    return row.status;
  }
  async questionLaunches(): Promise<number> {
    return (
      (
        await this.pool.query<{ count: number }>(
          "SELECT COUNT(*)::integer AS count FROM question_call_ordinals",
        )
      ).rows[0]?.count ?? 0
    );
  }
  processEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      STOCKSEMBLY_DATABASE_URL: this.pool.options.connectionString,
      STOCKSEMBLY_DATABASE_SSL: "false",
    };
  }
  async cleanup(): Promise<void> {
    await this.closeDatabase();
    rmSync(this.directory, { recursive: true, force: true });
  }
}

export async function createLeaseEngineFixture(): Promise<LeaseEngineFixture> {
  const database = await createResearchTestDatabase();
  return new LeaseEngineFixture(database.pool, database.close);
}

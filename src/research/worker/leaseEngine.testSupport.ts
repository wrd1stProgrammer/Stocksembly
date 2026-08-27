import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  AttemptIdSchema,
  EventIdSchema,
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../domain/ids";
import {
  openSqliteStore,
  type SqliteStore,
} from "../server/persistence/sqlite/sqliteStore";
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
  readonly databasePath = join(this.directory, "worker.sqlite");
  readonly clock = new ManualWorkerClock();
  readonly handler = new RecordingHandler();
  readonly #control: SqliteStore;
  #identity = 800_000;
  #seed = 1;

  constructor() {
    this.#control = openSqliteStore(this.databasePath);
  }

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
      databasePath: this.databasePath,
      ownerId,
      handler,
      clock: this.clock,
      identities,
      ...(options.retryRandom === undefined
        ? {}
        : { retryRandom: options.retryRandom }),
    });
  }

  seedResearchJob(
    value = this.#seed++,
    budget?: {
      readonly remainingBaseCalls: number;
      readonly requestedOptionalCalls: number;
      readonly requestedReplacementCalls: number;
    },
  ): Seed {
    const base = value * 100;
    const seed = {
      runId: RunIdSchema.parse(uuid(base + 1)),
      snapshotId: SnapshotIdSchema.parse(uuid(base + 2)),
      jobId: JobIdSchema.parse(uuid(base + 3)),
    };
    this.#control.createRun({
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

  seedResearchJobs(
    count: number,
    value = this.#seed++,
    budget?: {
      readonly remainingBaseCalls: number;
      readonly requestedOptionalCalls: number;
      readonly requestedReplacementCalls: number;
    },
  ): readonly Seed[] {
    const first = this.seedResearchJob(value, budget);
    const jobs = [first];
    for (let index = 1; index < count; index += 1) {
      jobs.push({
        runId: first.runId,
        snapshotId: first.snapshotId,
        jobId: JobIdSchema.parse(uuid(value * 100 + index + 10)),
      });
    }
    if (jobs.length > 1) {
      this.#control.transitionRun({
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

  seedQuestionJob(value = this.#seed++): QuestionSeed {
    return seedQuestion(this.#control, this.databasePath, this.clock, value);
  }

  leaseOnly(jobId: string, ownerId: string, expiresAt: string): number {
    const lease = this.#control.leaseJob({
      jobId: JobIdSchema.parse(jobId),
      ownerId,
      now: this.clock.now(),
      expiresAt,
    });
    if (lease === undefined) throw new RangeError("lease fixture missing");
    return lease.token;
  }

  launches(
    runId?: string,
  ): readonly { readonly ordinal: number; readonly attempt_id: string }[] {
    const database = new Database(this.databasePath);
    try {
      return database
        .prepare(`SELECT ordinal, attempt_id FROM research_call_ordinals
          ${runId === undefined ? "" : "WHERE run_id = ?"} ORDER BY run_id, ordinal`)
        .all(...(runId === undefined ? [] : [runId])) as readonly {
        readonly ordinal: number;
        readonly attempt_id: string;
      }[];
    } finally {
      database.close();
    }
  }

  job(jobId: string): {
    readonly status: string;
    readonly lease_token: number;
    readonly lease_expires_at: string | null;
  } {
    const database = new Database(this.databasePath);
    try {
      const row = database
        .prepare(`SELECT status, lease_token, lease_expires_at
        FROM jobs WHERE job_id = ?`)
        .get(jobId);
      if (row === undefined) throw new RangeError("job fixture missing");
      return row as {
        readonly status: string;
        readonly lease_token: number;
        readonly lease_expires_at: string | null;
      };
    } finally {
      database.close();
    }
  }

  runStatus(runId: string): string {
    const database = new Database(this.databasePath);
    try {
      const row = database
        .prepare("SELECT status FROM runs WHERE run_id = ?")
        .get(runId);
      if (
        typeof row !== "object" ||
        row === null ||
        !("status" in row) ||
        typeof row.status !== "string"
      )
        throw new RangeError("run fixture missing");
      return row.status;
    } finally {
      database.close();
    }
  }

  failResearchJobsWithoutTerminalEvent(runId: string): void {
    const database = new Database(this.databasePath);
    try {
      database
        .prepare(`UPDATE jobs SET status = 'failed', lease_owner = NULL,
          lease_expires_at = NULL WHERE run_id = ? AND kind = 'research'`)
        .run(runId);
    } finally {
      database.close();
    }
  }

  eventCount(runId: string, type: string): number {
    const database = new Database(this.databasePath);
    try {
      const row = database
        .prepare(`SELECT COUNT(*) AS count FROM run_events
        WHERE run_id = ? AND event_type = ?`)
        .get(runId, type);
      return (row as { readonly count: number }).count;
    } finally {
      database.close();
    }
  }

  eventPayload(runId: string, type: string): unknown {
    const database = new Database(this.databasePath);
    try {
      const row = database
        .prepare(
          `SELECT payload_json AS payloadJson FROM run_events
           WHERE run_id = ? AND event_type = ? ORDER BY sequence DESC LIMIT 1`,
        )
        .get(runId, type) as { payloadJson: string } | undefined;
      return row === undefined ? undefined : JSON.parse(row.payloadJson);
    } finally {
      database.close();
    }
  }

  run(runId: string) {
    return this.#control.findRun(runId);
  }

  completeRun(runId: string, eventId: string): void {
    this.#control.transitionRun({
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

  limitations(runId: string): readonly string[] {
    const database = new Database(this.databasePath);
    try {
      return database
        .prepare(
          "SELECT code FROM run_public_limitations WHERE run_id = ? ORDER BY code",
        )
        .all(runId)
        .map((row) => (row as { readonly code: string }).code);
    } finally {
      database.close();
    }
  }

  budgets(runId: string): {
    readonly remainingBaseCalls: number;
    readonly requestedReplacementCalls: number;
  } {
    const database = new Database(this.databasePath);
    try {
      const row = database
        .prepare(`SELECT remaining_base_calls, requested_replacement_calls
          FROM runs WHERE run_id = ?`)
        .get(runId);
      if (
        typeof row !== "object" ||
        row === null ||
        !("remaining_base_calls" in row) ||
        typeof row.remaining_base_calls !== "number" ||
        !("requested_replacement_calls" in row) ||
        typeof row.requested_replacement_calls !== "number"
      )
        throw new RangeError("run budget fixture missing");
      return {
        remainingBaseCalls: row.remaining_base_calls,
        requestedReplacementCalls: row.requested_replacement_calls,
      };
    } finally {
      database.close();
    }
  }

  runtimeStates(runId: string): readonly string[] {
    const database = new Database(this.databasePath);
    try {
      return database
        .prepare(`SELECT state_id FROM run_events
          WHERE run_id = ? AND event_type = 'runtime_status'
          ORDER BY sequence`)
        .all(runId)
        .map((row) => {
          if (
            typeof row !== "object" ||
            row === null ||
            !("state_id" in row) ||
            typeof row.state_id !== "string"
          )
            throw new TypeError("runtime state fixture is invalid");
          return row.state_id;
        });
    } finally {
      database.close();
    }
  }

  attemptCommittedPayloads(runId: string): readonly unknown[] {
    const database = new Database(this.databasePath);
    try {
      return database
        .prepare(`SELECT payload_json FROM run_events
          WHERE run_id = ? AND event_type = 'attempt_committed'
          ORDER BY sequence`)
        .all(runId)
        .map((row) =>
          JSON.parse((row as { readonly payload_json: string }).payload_json),
        );
    } finally {
      database.close();
    }
  }

  attempt(attemptId: string) {
    return this.#control.findAttempt(attemptId);
  }

  questionStatus(questionId: string): string {
    const database = new Database(this.databasePath);
    try {
      const row = database
        .prepare("SELECT status FROM questions WHERE question_id = ?")
        .get(questionId) as { readonly status: string } | undefined;
      if (row === undefined) throw new RangeError("question fixture missing");
      return row.status;
    } finally {
      database.close();
    }
  }

  questionLaunches(): number {
    const database = new Database(this.databasePath);
    try {
      const row = database
        .prepare("SELECT COUNT(*) AS count FROM question_call_ordinals")
        .get() as { readonly count: number };
      return row.count;
    } finally {
      database.close();
    }
  }

  cleanup(): void {
    this.#control.close();
    rmSync(this.directory, { recursive: true, force: true });
  }
}

export function createLeaseEngineFixture(): LeaseEngineFixture {
  return new LeaseEngineFixture();
}

import { randomUUID } from "node:crypto";
import { AttemptIdSchema, EventIdSchema, type RunId } from "../domain/ids";
import { CodexRunnerError } from "../server/codex/codexErrors";
import type { CreateRunInput } from "../server/persistence/sqlite/types";
import { routeRunnerFailure } from "./leaseEngineFailureRouting";
import { SqliteLeaseEngineStore } from "./leaseEngineSqlite";
import type { ClaimedJob, LeaseEngineStore } from "./leaseEngineSqliteTypes";
import {
  type AttemptHandler,
  type CapacityState,
  LEASE_ENGINE_DEFAULTS,
  type PollResult,
  type RunAdmissionResult,
  type WorkerAttempt,
  type WorkerClock,
  WorkerCrashError,
  type WorkerIdentityFactory,
} from "./leaseEngineTypes";
import {
  type LeaseWorkerSchedulerOptions,
  runLeaseWorkerScheduler,
} from "./leaseWorkerScheduler";

export type LeaseEngineOptions = {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly ownerId: string;
  readonly handler: AttemptHandler;
  readonly clock?: WorkerClock;
  readonly identities?: WorkerIdentityFactory;
  readonly retryRandom?: () => number;
  readonly store?: LeaseEngineStore;
};

const systemClock: WorkerClock = { now: () => new Date().toISOString() };
const randomIdentities: WorkerIdentityFactory = {
  attemptId: () => AttemptIdSchema.parse(randomUUID()),
  eventId: randomUUID,
};

function after(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

export class LeaseEngine {
  readonly #ownerId: string;
  readonly #handler: AttemptHandler;
  readonly #clock: WorkerClock;
  readonly #identities: WorkerIdentityFactory;
  readonly #retryRandom: () => number;
  readonly #store: LeaseEngineStore;
  readonly #active = new Map<string, ClaimedJob>();
  readonly #controllers = new Map<string, AbortController>();
  readonly #tasksByAttempt = new Map<string, Promise<PollResult>>();
  readonly #tasks = new Set<Promise<PollResult>>();
  readonly #activityAt = new Map<string, string>();
  #stopping = false;

  constructor(options: LeaseEngineOptions) {
    this.#ownerId = options.ownerId;
    this.#handler = options.handler;
    this.#clock = options.clock ?? systemClock;
    this.#identities = options.identities ?? randomIdentities;
    this.#retryRandom = options.retryRandom ?? Math.random;
    this.#store =
      options.store ??
      new SqliteLeaseEngineStore(
        options.databasePath,
        options.migrationsDirectory,
      );
  }

  poll(): Promise<PollResult> {
    if (this.#stopping) return Promise.resolve({ kind: "stopping" });
    const now = this.#clock.now();
    this.#store.activateNextRun(this.#identities.eventId(), now);
    const claim = this.#store.claim(
      this.#ownerId,
      now,
      after(now, LEASE_ENGINE_DEFAULTS.leaseMs),
    );
    if (claim === undefined) return Promise.resolve({ kind: "idle" });
    const attemptId = this.#identities.attemptId();
    const reservation = this.#store.reserve({
      claim,
      attemptId,
      eventId: this.#identities.eventId(),
      now,
    });
    if (reservation.kind === "capacity") {
      this.#store.release(claim);
      return Promise.resolve({ kind: "capacity" });
    }
    if (reservation.kind === "incomplete")
      return Promise.resolve({ kind: "incomplete" });
    const attempt: WorkerAttempt = {
      attemptId,
      jobId: claim.jobId,
      runId: claim.runId,
      snapshotId: claim.snapshotId,
      kind: claim.kind,
      ordinal: reservation.ordinal,
    };
    const controller = new AbortController();
    this.#active.set(attemptId, claim);
    this.#controllers.set(attemptId, controller);
    this.#activityAt.set(attemptId, now);
    const task = this.execute(claim, attempt, controller.signal);
    this.#tasks.add(task);
    this.#tasksByAttempt.set(attemptId, task);
    const removeTask = () => this.#tasks.delete(task);
    void task.then(removeTask, removeTask);
    return task;
  }

  async reconcile(): Promise<boolean> {
    try {
      await this.#handler.reconcile?.();
      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error(
          JSON.stringify({
            kind: "workflow_reconcile_failed",
            name: error.name,
            message: error.message,
          }),
        );
        return false;
      }
      throw error;
    }
  }

  admit(input: CreateRunInput): RunAdmissionResult {
    return this.#store.admit(input);
  }

  heartbeat(): number {
    const now = this.#clock.now();
    let extended = 0;
    for (const [attemptId, claim] of this.#active) {
      if (this.#store.cancellationRequested(claim)) {
        this.#controllers.get(attemptId)?.abort();
        continue;
      }
      const activityAt = this.#activityAt.get(attemptId);
      if (
        activityAt === undefined ||
        Date.parse(now) - Date.parse(activityAt) >=
          LEASE_ENGINE_DEFAULTS.inactivityMs
      ) {
        this.#controllers.get(attemptId)?.abort();
        continue;
      }
      if (
        this.#store.heartbeat(
          claim,
          now,
          after(now, LEASE_ENGINE_DEFAULTS.leaseMs),
        )
      )
        extended += 1;
    }
    return extended;
  }

  recoverExpired(): readonly string[] {
    return this.#store.recoverExpired(this.#clock.now());
  }

  recoverCircuit(runId: RunId): boolean {
    return this.#store.recoverCircuit(runId, this.#clock.now());
  }

  capacity(): CapacityState {
    return this.#store.capacity();
  }

  async cancel(runId: RunId): Promise<{
    readonly kind: "cancelled" | "terminal_immutable" | "race_lost";
  }> {
    const request = this.#store.requestCancellation({
      runId,
      eventId: EventIdSchema.parse(this.#identities.eventId()),
      terminalEventId: EventIdSchema.parse(this.#identities.eventId()),
      now: this.#clock.now(),
    });
    if (request.kind === "terminal_immutable")
      return { kind: "terminal_immutable" };
    const tasks = request.activeAttemptIds.flatMap((attemptId) => {
      this.#controllers.get(attemptId)?.abort();
      const task = this.#tasksByAttempt.get(attemptId);
      return task === undefined ? [] : [task];
    });
    await Promise.all(tasks);
    if (request.activeAttemptIds.length === 0) return { kind: "cancelled" };
    const finalized = this.#store.finalizeCancellation({
      runId,
      expectedVersion: request.version,
      eventId: EventIdSchema.parse(this.#identities.eventId()),
      now: this.#clock.now(),
    });
    return { kind: finalized ? "cancelled" : "race_lost" };
  }

  runUntilStopped(
    signal: AbortSignal,
    options: LeaseWorkerSchedulerOptions = {},
  ): Promise<void> {
    return runLeaseWorkerScheduler(this, signal, options);
  }

  async shutdown(): Promise<void> {
    this.#stopping = true;
    for (const controller of this.#controllers.values()) controller.abort();
    await Promise.all(this.#tasks);
    this.#store.close();
  }

  private async execute(
    claim: ClaimedJob,
    attempt: WorkerAttempt,
    signal: AbortSignal,
  ): Promise<PollResult> {
    try {
      const outcome = await this.#handler.run(attempt, signal, () => {
        this.#activityAt.set(attempt.attemptId, this.#clock.now());
      });
      return await this.commitOutcome(claim, attempt, outcome);
    } catch (error) {
      if (error instanceof WorkerCrashError)
        return { kind: "crashed", attempt };
      if (error instanceof CodexRunnerError) {
        const outcome = routeRunnerFailure(error, {
          now: this.#clock.now(),
          failures: claim.transientFailures,
          random: this.#retryRandom,
          ...(claim.retryClassification === undefined
            ? {}
            : { retryClassification: claim.retryClassification }),
        });
        return await this.commitOutcome(claim, attempt, outcome);
      }
      const failureName = error instanceof Error ? error.name : "Unknown";
      return await this.commitOutcome(claim, attempt, {
        kind: "permanent",
        code: `unexpected_worker_failure:${failureName}`,
      });
    } finally {
      this.#active.delete(attempt.attemptId);
      this.#controllers.delete(attempt.attemptId);
      this.#tasksByAttempt.delete(attempt.attemptId);
      this.#activityAt.delete(attempt.attemptId);
    }
  }

  private async commitOutcome(
    claim: ClaimedJob,
    attempt: WorkerAttempt,
    outcome: import("./leaseEngineTypes").AttemptOutcome,
  ): Promise<PollResult> {
    const committed = this.#store.commit({
      claim,
      attemptId: attempt.attemptId,
      eventId: this.#identities.eventId(),
      now: this.#clock.now(),
      outcome,
    });
    let coordinationPending = false;
    try {
      await this.#handler.afterCommit?.(attempt, outcome);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      coordinationPending = true;
    }
    return {
      kind: "handled",
      attempt,
      outcome,
      committed,
      coordinationPending,
    };
  }
}

export function createLeaseEngine(options: LeaseEngineOptions): LeaseEngine {
  return new LeaseEngine(options);
}

export type {
  AttemptHandler,
  AttemptOutcome,
  CapacityState,
  PollResult,
  RunAdmissionResult,
  WorkerAttempt,
  WorkerClock,
  WorkerIdentityFactory,
} from "./leaseEngineTypes";
export { LEASE_ENGINE_DEFAULTS, WorkerCrashError } from "./leaseEngineTypes";

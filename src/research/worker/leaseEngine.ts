import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AttemptIdSchema, EventIdSchema, type RunId } from "../domain/ids";
import { CodexRunnerError } from "../server/codex/codexErrors";
import type { CreateRunInput } from "../server/persistence/postgres/types";
import { routeRunnerFailure } from "./leaseEngineFailureRouting";
import { PostgresLeaseEngineStore } from "./leaseEnginePostgres";
import type { ClaimedJob, LeaseEngineStore } from "./leaseEnginePostgresTypes";
import {
  type AttemptHandler,
  type AttemptOutcome,
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
  readonly pool: Pool;
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
  readonly #pollTasks = new Set<Promise<PollResult>>();
  #stopping = false;

  constructor(options: LeaseEngineOptions) {
    this.#ownerId = options.ownerId;
    this.#handler = options.handler;
    this.#clock = options.clock ?? systemClock;
    this.#identities = options.identities ?? randomIdentities;
    this.#retryRandom = options.retryRandom ?? Math.random;
    this.#store = options.store ?? new PostgresLeaseEngineStore(options.pool);
  }

  poll(): Promise<PollResult> {
    const task = this.pollNext();
    this.#pollTasks.add(task);
    const remove = () => this.#pollTasks.delete(task);
    void task.then(remove, remove);
    return task;
  }

  private async pollNext(): Promise<PollResult> {
    if (this.#stopping) return Promise.resolve({ kind: "stopping" });
    const now = this.#clock.now();
    await this.#store.activateNextRun(this.#identities.eventId(), now);
    const claim = await this.#store.claim(
      this.#ownerId,
      now,
      after(now, LEASE_ENGINE_DEFAULTS.leaseMs),
    );
    if (claim === undefined) return Promise.resolve({ kind: "idle" });
    if (this.#stopping) {
      await this.#store.release(claim);
      return { kind: "stopping" };
    }
    const attemptId = this.#identities.attemptId();
    const reservation = await this.#store.reserve({
      claim,
      attemptId,
      eventId: this.#identities.eventId(),
      now,
    });
    if (reservation.kind === "capacity") {
      await this.#store.release(claim);
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
    if (this.#stopping) controller.abort();
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

  async admit(input: CreateRunInput): Promise<RunAdmissionResult> {
    return this.#store.admit(input);
  }

  async heartbeat(): Promise<number> {
    const now = this.#clock.now();
    let extended = 0;
    for (const [attemptId, claim] of this.#active) {
      if (await this.#store.cancellationRequested(claim)) {
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
        await this.#store.heartbeat(
          claim,
          now,
          after(now, LEASE_ENGINE_DEFAULTS.leaseMs),
        )
      )
        extended += 1;
      else this.#controllers.get(attemptId)?.abort();
    }
    return extended;
  }

  async recoverExpired(): Promise<readonly string[]> {
    return this.#store.recoverExpired(this.#clock.now());
  }

  async recoverCircuit(runId: RunId): Promise<boolean> {
    return this.#store.recoverCircuit(runId, this.#clock.now());
  }

  async capacity(): Promise<CapacityState> {
    return this.#store.capacity();
  }

  async cancel(runId: RunId): Promise<{
    readonly kind: "cancelled" | "terminal_immutable" | "race_lost";
  }> {
    const request = await this.#store.requestCancellation({
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
    const finalized = await this.#store.finalizeCancellation({
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
    await Promise.all([...this.#tasks, ...this.#pollTasks]);
    await this.#store.close();
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
      if (
        signal.aborted &&
        (error instanceof Error || error instanceof DOMException) &&
        error.name === "AbortError"
      )
        return await this.commitOutcome(claim, attempt, {
          kind: "incomplete",
          code: "cancelled",
        });
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
    outcome: AttemptOutcome,
  ): Promise<PollResult> {
    if (
      outcome.kind === "incomplete" &&
      outcome.code === "cancelled" &&
      this.#controllers.get(attempt.attemptId)?.signal.aborted &&
      !(await this.#store.cancellationRequested(claim))
    ) {
      outcome = {
        kind: "transient",
        code: this.#stopping
          ? "worker_restarting"
          : "worker_attempt_interrupted",
        retryAt: after(this.#clock.now(), 30_000),
      };
    }
    const committed = await this.#store.commit({
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

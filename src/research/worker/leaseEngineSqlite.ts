import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  AttemptIdSchema,
  EventIdSchema,
  QuestionIdSchema,
} from "../domain/ids";
import {
  reserveQuestionLaunch,
  reserveResearchLaunch,
} from "../server/persistence/sqlite/launchRepository";
import { heartbeatJobLease } from "../server/persistence/sqlite/leaseRepository";
import { applyOrderedMigrations } from "../server/persistence/sqlite/migrations";
import {
  finalizeRunCancellation,
  requestRunCancellation,
} from "../server/persistence/sqlite/runControlRepository";
import { appendRunEvent } from "../server/persistence/sqlite/runRepository";
import type { CreateRunInput } from "../server/persistence/sqlite/types";
import { consumeChairResumeReceiptException } from "../workflow/chairResumePermit";
import { reserveWithinRunBudget } from "./leaseEngineBudget";
import { activateNextRun, admitRun } from "./leaseEngineSqliteAdmission";
import { claimNextJob } from "./leaseEngineSqliteClaim";
import { commitAttempt } from "./leaseEngineSqliteCommit";
import { recoverExpiredAttempts } from "./leaseEngineSqliteRecovery";
import type {
  ClaimedJob,
  CommitInput,
  LeaseEngineStore,
  ReservationResult,
  ReserveInput,
} from "./leaseEngineSqliteTypes";
import type { RunAdmissionResult } from "./leaseEngineTypes";
import { LEASE_ENGINE_DEFAULTS } from "./leaseEngineTypes";

const CountSchema = z.object({ count: z.number().int().nonnegative() });

export class SqliteLeaseEngineStore implements LeaseEngineStore {
  readonly #database: Database.Database;

  constructor(path: string, migrationsDirectory?: string) {
    this.#database = new Database(path, { timeout: 5_000 });
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    applyOrderedMigrations(this.#database, migrationsDirectory);
  }

  admit(input: CreateRunInput): RunAdmissionResult {
    return admitRun(this.#database, input);
  }

  activateNextRun(eventId: string, now: string): boolean {
    return activateNextRun(this.#database, eventId, now);
  }

  claim(
    ownerId: string,
    now: string,
    expiresAt: string,
  ): ClaimedJob | undefined {
    return this.#database
      .transaction(() => {
        const claim = claimNextJob(this.#database, ownerId, now, expiresAt);
        if (claim?.retryClassification !== undefined)
          appendRunEvent(this.#database, {
            runId: claim.runId,
            event: {
              eventId: EventIdSchema.parse(randomUUID()),
              type: "runtime_status",
              stateId: "retrying",
              occurredAt: now,
              jobId: claim.jobId,
              payload: {},
            },
          });
        return claim;
      })
      .immediate();
  }

  reserve(input: ReserveInput): ReservationResult {
    return this.#database
      .transaction(() => {
        const active = CountSchema.parse(
          this.#database
            .prepare(`SELECT COUNT(*) AS count FROM jobs
            WHERE status IN ('spawn-reserved', 'running', 'cancel-requested')`)
            .get(),
        ).count;
        if (active >= LEASE_ENGINE_DEFAULTS.globalCodexProcesses)
          return { kind: "capacity" } as const;
        if (
          input.claim.kind === "research" &&
          !reserveWithinRunBudget(this.#database, input)
        )
          return { kind: "incomplete" } as const;
        if (
          input.claim.kind === "research" &&
          !consumeChairResumeReceiptException(
            this.#database,
            input.claim.runId,
            input.claim.jobId,
          )
        )
          return { kind: "incomplete" } as const;
        const event = {
          eventId: EventIdSchema.parse(input.eventId),
          type: "spawn_reserved",
          stateId: "spawn-reserved",
          occurredAt: input.now,
        } as const;
        const reservation =
          input.claim.kind === "research"
            ? reserveResearchLaunch(this.#database, {
                runId: input.claim.runId,
                jobId: input.claim.jobId,
                attemptId: input.attemptId,
                logicalArtifactKey: input.claim.logicalKey,
                inputHash: input.claim.inputHash,
                ownerId: input.claim.ownerId,
                token: input.claim.leaseToken,
                now: input.now,
                reservedAt: input.now,
                event,
                ...(input.claim.priorAttemptId === undefined ||
                input.claim.retryClassification === "transient"
                  ? {}
                  : { replacementOfAttemptId: input.claim.priorAttemptId }),
              })
            : reserveQuestionLaunch(this.#database, {
                questionId: QuestionIdSchema.parse(input.claim.questionId),
                attemptId: input.attemptId,
                inputHash: input.claim.inputHash,
                ownerId: input.claim.ownerId,
                token: input.claim.leaseToken,
                now: input.now,
                reservedAt: input.now,
                event,
              });
        this.#database
          .prepare(`UPDATE attempts SET status = 'running'
          WHERE attempt_id = ? AND status = 'spawn-reserved'`)
          .run(input.attemptId);
        this.#database
          .prepare(`UPDATE jobs SET status = 'running'
          WHERE job_id = ? AND status = 'spawn-reserved'`)
          .run(input.claim.jobId);
        if (input.claim.kind === "qa")
          this.#database
            .prepare(`UPDATE questions SET status = 'running'
            WHERE question_id = ? AND status = 'spawn_reserved'`)
            .run(input.claim.questionId);
        return { kind: "reserved", ordinal: reservation.ordinal } as const;
      })
      .immediate();
  }

  heartbeat(claim: ClaimedJob, now: string, expiresAt: string): boolean {
    return heartbeatJobLease(this.#database, {
      jobId: claim.jobId,
      ownerId: claim.ownerId,
      token: claim.leaseToken,
      now,
      expiresAt,
    });
  }

  cancellationRequested(claim: ClaimedJob): boolean {
    return (
      this.#database
        .prepare(`SELECT 1 FROM jobs WHERE job_id = @jobId
          AND lease_owner = @ownerId AND lease_token = @leaseToken
          AND status = 'cancel-requested'`)
        .get(claim) !== undefined
    );
  }

  commit(input: CommitInput): boolean {
    return this.#database
      .transaction(() => commitAttempt(this.#database, input))
      .immediate();
  }

  release(claim: ClaimedJob): void {
    this.#database
      .prepare(`UPDATE jobs SET status = 'queued', lease_owner = NULL,
      lease_expires_at = NULL WHERE job_id = @jobId AND status = 'leased'
      AND lease_owner = @ownerId AND lease_token = @leaseToken`)
      .run(claim);
  }

  recoverExpired(now: string): readonly z.infer<typeof AttemptIdSchema>[] {
    return recoverExpiredAttempts(this.#database, now).map((id) =>
      AttemptIdSchema.parse(id),
    );
  }

  recoverCircuit(
    runId: Parameters<LeaseEngineStore["recoverCircuit"]>[0],
    now: string,
  ): boolean {
    const changed = this.#database
      .prepare(`UPDATE idempotency_records SET
        result_json = json_set(result_json,
          '$.retryAt', @now,
          '$.failureCount', 0,
          '$.circuitOpen', json('false'),
          '$.classification', 'transient'),
        created_at = @now
        WHERE scope = 'worker-retry' AND idempotency_key IN (
          SELECT job_id FROM jobs WHERE run_id = @runId
            AND status = 'retry-wait'
        ) AND COALESCE(json_extract(result_json, '$.circuitOpen'), 0) = 1`)
      .run({ runId, now }).changes;
    return changed > 0;
  }

  capacity() {
    const count = (sql: string) =>
      CountSchema.parse(this.#database.prepare(sql).get()).count;
    const activeRuns = count(
      "SELECT COUNT(*) AS count FROM runs WHERE status = 'running'",
    );
    const queuedRuns = count(
      "SELECT COUNT(*) AS count FROM runs WHERE status = 'queued'",
    );
    const activeCodexProcesses = count(
      "SELECT COUNT(*) AS count FROM jobs WHERE status IN ('spawn-reserved', 'running', 'cancel-requested')",
    );
    return {
      activeRuns,
      queuedRuns,
      activeCodexProcesses,
      acceptsRun:
        activeRuns < LEASE_ENGINE_DEFAULTS.activeRuns &&
        queuedRuns < LEASE_ENGINE_DEFAULTS.queuedRuns,
    };
  }

  requestCancellation(
    input: Parameters<LeaseEngineStore["requestCancellation"]>[0],
  ) {
    return requestRunCancellation(this.#database, input);
  }

  finalizeCancellation(
    input: Parameters<LeaseEngineStore["finalizeCancellation"]>[0],
  ): boolean {
    return finalizeRunCancellation(this.#database, input);
  }

  close(): void {
    if (this.#database.open) this.#database.close();
  }
}

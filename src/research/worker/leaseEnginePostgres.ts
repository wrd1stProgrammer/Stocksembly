import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AttemptIdSchema,
  EventIdSchema,
  QuestionIdSchema,
} from "../domain/ids";
import {
  type ResearchDatabase,
  researchTransaction,
} from "../server/persistence/postgres/database";
import {
  reserveQuestionLaunch,
  reserveResearchLaunch,
} from "../server/persistence/postgres/launchRepository";
import { heartbeatJobLease } from "../server/persistence/postgres/leaseRepository";

import {
  finalizeRunCancellation,
  requestRunCancellation,
} from "../server/persistence/postgres/runControlRepository";
import { appendRunEvent } from "../server/persistence/postgres/runRepository";
import type { CreateRunInput } from "../server/persistence/postgres/types";
import { consumeChairResumeReceiptException } from "../workflow/chairResumePermit";
import { reserveWithinRunBudget } from "./leaseEngineBudget";
import { activateNextRun, admitRun } from "./leaseEnginePostgresAdmission";
import { claimNextJob } from "./leaseEnginePostgresClaim";
import { commitAttempt } from "./leaseEnginePostgresCommit";
import { recoverExpiredAttempts } from "./leaseEnginePostgresRecovery";
import type {
  ClaimedJob,
  CommitInput,
  LeaseEngineStore,
  ReservationResult,
  ReserveInput,
} from "./leaseEnginePostgresTypes";
import type { RunAdmissionResult } from "./leaseEngineTypes";
import { LEASE_ENGINE_DEFAULTS } from "./leaseEngineTypes";

const CountSchema = z.object({ count: z.coerce.number().int().nonnegative() });

export class PostgresLeaseEngineStore implements LeaseEngineStore {
  readonly #database: ResearchDatabase;

  constructor(database: ResearchDatabase) {
    this.#database = database;
  }

  async admit(input: CreateRunInput): Promise<RunAdmissionResult> {
    return admitRun(this.#database, input);
  }

  async activateNextRun(eventId: string, now: string): Promise<boolean> {
    return activateNextRun(this.#database, eventId, now);
  }

  async claim(
    ownerId: string,
    now: string,
    expiresAt: string,
  ): Promise<ClaimedJob | undefined> {
    return researchTransaction(this.#database, async (database) => {
      await database.query("SELECT pg_advisory_xact_lock(73921402)");
      const claim = await claimNextJob(database, ownerId, now, expiresAt);
      if (claim?.retryClassification !== undefined)
        await appendRunEvent(database, {
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
    });
  }

  async reserve(input: ReserveInput): Promise<ReservationResult> {
    return researchTransaction(this.#database, async (database) => {
      await database.query("SELECT pg_advisory_xact_lock(73921402)");
      const active = CountSchema.parse(
        (
          await database.query(`SELECT COUNT(*) AS count FROM jobs
            WHERE status IN ('spawn-reserved', 'running', 'cancel-requested')`)
        ).rows[0],
      ).count;
      if (active >= LEASE_ENGINE_DEFAULTS.globalCodexProcesses)
        return { kind: "capacity" } as const;
      if (
        input.claim.kind === "research" &&
        !(await reserveWithinRunBudget(database, input))
      )
        return { kind: "incomplete" } as const;
      if (
        input.claim.kind === "research" &&
        !(await consumeChairResumeReceiptException(
          database,
          input.claim.runId,
          input.claim.jobId,
        ))
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
          ? await reserveResearchLaunch(database, {
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
          : await reserveQuestionLaunch(database, {
              questionId: QuestionIdSchema.parse(input.claim.questionId),
              attemptId: input.attemptId,
              inputHash: input.claim.inputHash,
              ownerId: input.claim.ownerId,
              token: input.claim.leaseToken,
              now: input.now,
              reservedAt: input.now,
              event,
            });
      await database.query(
        `UPDATE attempts SET status = 'running'
          WHERE attempt_id = $1 AND status = 'spawn-reserved'`,
        [input.attemptId],
      );
      await database.query(
        `UPDATE jobs SET status = 'running'
          WHERE job_id = $1 AND status = 'spawn-reserved'`,
        [input.claim.jobId],
      );
      if (input.claim.kind === "qa")
        await database.query(
          `UPDATE questions SET status = 'running'
            WHERE question_id = $1 AND status = 'spawn_reserved'`,
          [input.claim.questionId],
        );
      return { kind: "reserved", ordinal: reservation.ordinal } as const;
    });
  }

  async heartbeat(
    claim: ClaimedJob,
    now: string,
    expiresAt: string,
  ): Promise<boolean> {
    return heartbeatJobLease(this.#database, {
      jobId: claim.jobId,
      ownerId: claim.ownerId,
      token: claim.leaseToken,
      now,
      expiresAt,
    });
  }

  async cancellationRequested(claim: ClaimedJob): Promise<boolean> {
    return (
      (
        await this.#database.query(
          `SELECT 1 FROM jobs WHERE job_id = $1
          AND lease_owner = $2 AND lease_token = $3
          AND status = 'cancel-requested'`,
          [claim.jobId, claim.ownerId, claim.leaseToken],
        )
      ).rows[0] !== undefined
    );
  }

  async commit(input: CommitInput): Promise<boolean> {
    return researchTransaction(this.#database, async (database) => {
      await database.query(
        "SELECT run_id FROM runs WHERE run_id = $1 FOR UPDATE",
        [input.claim.runId],
      );
      return commitAttempt(database, input);
    });
  }

  async release(claim: ClaimedJob): Promise<void> {
    await this.#database.query(
      `UPDATE jobs SET status = 'queued', lease_owner = NULL,
      lease_expires_at = NULL WHERE job_id = $1 AND status = 'leased'
      AND lease_owner = $2 AND lease_token = $3`,
      [claim.jobId, claim.ownerId, claim.leaseToken],
    );
  }

  async recoverExpired(
    now: string,
  ): Promise<readonly z.infer<typeof AttemptIdSchema>[]> {
    return (await recoverExpiredAttempts(this.#database, now)).map((id) =>
      AttemptIdSchema.parse(id),
    );
  }

  async recoverCircuit(
    runId: Parameters<LeaseEngineStore["recoverCircuit"]>[0],
    now: string,
  ): Promise<boolean> {
    const changed = (
      await this.#database.query(
        `UPDATE idempotency_records SET
        result_json = (result_json::jsonb || jsonb_build_object('retryAt', $1::text, 'failureCount', 0, 'circuitOpen', false, 'classification', 'transient'))::text,
        created_at = $1
        WHERE scope = 'worker-retry' AND idempotency_key IN (
          SELECT job_id FROM jobs WHERE run_id = $2
            AND status = 'retry-wait'
        ) AND COALESCE(CASE WHEN (result_json::jsonb ->> 'circuitOpen')::boolean THEN 1 ELSE 0 END, 0) = 1`,
        [{ runId, now }.now, { runId, now }.runId],
      )
    ).rowCount;
    return (changed ?? 0) > 0;
  }

  async capacity() {
    const count = async (sql: string) =>
      CountSchema.parse((await this.#database.query(sql)).rows[0]).count;
    const activeRuns = await count(
      "SELECT COUNT(*) AS count FROM runs WHERE status = 'running'",
    );
    const queuedRuns = await count(
      "SELECT COUNT(*) AS count FROM runs WHERE status = 'queued'",
    );
    const activeCodexProcesses = await count(
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

  async requestCancellation(
    input: Parameters<LeaseEngineStore["requestCancellation"]>[0],
  ) {
    return requestRunCancellation(this.#database, input);
  }

  async finalizeCancellation(
    input: Parameters<LeaseEngineStore["finalizeCancellation"]>[0],
  ): Promise<boolean> {
    return finalizeRunCancellation(this.#database, input);
  }

  async close(): Promise<void> {
    // The application owns the shared pool.
  }
}

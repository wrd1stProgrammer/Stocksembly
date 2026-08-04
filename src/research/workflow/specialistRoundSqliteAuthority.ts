import Database from "better-sqlite3";
import { z } from "zod";
import { hashCanonical } from "../domain/contractHelpers";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../domain/ids";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import type {
  LaunchReservationKey,
  LaunchReservationReader,
} from "../server/codex/codexRunner";
import { applyOrderedMigrations } from "../server/persistence/sqlite/migrations";
import { parseSafeJson } from "../server/persistence/sqlite/safeJson";
import type {
  PersistedSpecialistJob,
  SpecialistDurableReceipt,
} from "./specialistRoundSqliteContracts";
import { PersistedSpecialistJobSchema } from "./specialistRoundSqliteContracts";

const ClaimRowSchema = z.object({
  lease_owner: z.string().min(1),
  lease_token: z.number().int().positive(),
});
const ReservationRowSchema = ClaimRowSchema.extend({
  run_id: RunIdSchema,
  job_id: JobIdSchema,
  attempt_id: AttemptIdSchema,
  ordinal: z.number().int().positive(),
  input_hash: z.string().regex(/^[a-f0-9]{64}$/),
  lease_expires_at: z.string(),
});
const ReceiptRowSchema = z.object({
  ordinal: z.number().int().positive(),
  logical_artifact_key: z.string(),
  attempt_id: AttemptIdSchema,
  outcome: z.string().nullable(),
  evidence_recorded: z.number().int().min(0).max(1),
});
const CommitRowSchema = z.object({
  artifact_id: z.string().uuid(),
  sequence: z.number().int().positive(),
});
const LogicalArtifactRowSchema = z.object({ logical_artifact_key: z.string() });
const SourceArtifactRowSchema = z.object({
  artifact_id: z.string().uuid(),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  media_type: z.string().min(1),
});

export class SpecialistRoundSqliteAuthority implements LaunchReservationReader {
  readonly #database: Database.Database;

  constructor(
    path: string,
    options: { readonly migrationsDirectory?: string } = {},
  ) {
    this.#database = new Database(path, { timeout: 5_000 });
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    applyOrderedMigrations(this.#database, options.migrationsDirectory);
  }

  sealSnapshot(snapshotId: string, cutoffAt: string, sealedAt: string): void {
    this.#database
      .prepare(`UPDATE snapshots SET state = 'sealed',
        evidence_cutoff_at = ?, sealed_at = ? WHERE snapshot_id = ?`)
      .run(cutoffAt, sealedAt, snapshotId);
  }

  persistJobs(jobs: readonly PersistedSpecialistJob[], at: string): void {
    const insert = this.#database.prepare(`INSERT INTO idempotency_records(
      scope, idempotency_key, request_hash, result_json, created_at
    ) VALUES ('specialist-round-job', @key, @inputHash,
      @resultJson, @at)`);
    this.#database.transaction(() => {
      for (const job of jobs)
        insert.run({
          ...job,
          key: `${job.runId}:${job.logicalArtifactId}`,
          resultJson: JSON.stringify(job),
          at,
        });
    })();
  }

  reserveDepartmentTheses(input: {
    readonly runId: string;
    readonly departmentId: string;
    readonly roleId: string;
    readonly fingerprints: readonly string[];
    readonly at: string;
  }): boolean {
    const reservations = input.fingerprints.map((fingerprint) => {
      const fingerprintHash = hashCanonical(fingerprint);
      return {
        key: `${input.runId}:${input.departmentId}:${fingerprintHash}`,
        fingerprintHash,
      };
    });
    if (
      reservations.length === 0 ||
      new Set(reservations.map((reservation) => reservation.fingerprintHash))
        .size !== reservations.length
    )
      return false;
    const read = this.#database.prepare(`SELECT result_json
      FROM idempotency_records WHERE scope = 'specialist-department-thesis'
        AND idempotency_key = ?`);
    const insert = this.#database.prepare(`INSERT INTO idempotency_records(
      scope, idempotency_key, request_hash, result_json, created_at
    ) VALUES ('specialist-department-thesis', @key, @fingerprint,
      @resultJson, @at)`);
    try {
      return this.#database.transaction(() => {
        const pending: typeof reservations = [];
        for (const reservation of reservations) {
          const existing = z
            .object({ result_json: z.string() })
            .safeParse(read.get(reservation.key));
          if (existing.success) {
            const owner = z
              .object({ roleId: z.string() })
              .safeParse(parseSafeJson(existing.data.result_json));
            if (!owner.success || owner.data.roleId !== input.roleId)
              return false;
            continue;
          }
          pending.push(reservation);
        }
        for (const reservation of pending)
          insert.run({
            key: reservation.key,
            fingerprint: reservation.fingerprintHash,
            resultJson: JSON.stringify({ roleId: input.roleId }),
            at: input.at,
          });
        return true;
      })();
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code.startsWith("SQLITE_CONSTRAINT")
      )
        return false;
      throw error;
    }
  }

  releaseSystemCollectionReservation(
    runId: string,
    attemptId: string,
  ): void {
    this.#database.transaction(() => {
      const removed = this.#database
        .prepare(`DELETE FROM research_call_ordinals
          WHERE run_id = ? AND attempt_id = ?
            AND logical_artifact_key = 'collection:initial'`)
        .run(runId, attemptId).changes;
      if (removed === 1)
        this.#database
          .prepare(`UPDATE runs SET remaining_base_calls =
            remaining_base_calls + 1 WHERE run_id = ?`)
          .run(runId);
    })();
  }

  loadJob(
    runId: string,
    logicalArtifactId: string,
  ): PersistedSpecialistJob | undefined {
    const value = this.#database
      .prepare(`SELECT result_json FROM idempotency_records
        WHERE scope = 'specialist-round-job' AND idempotency_key = ?`)
      .get(`${runId}:${logicalArtifactId}`);
    const parsedRow = z.object({ result_json: z.string() }).safeParse(value);
    if (!parsedRow.success) return undefined;
    return PersistedSpecialistJobSchema.parse(
      parseSafeJson(parsedRow.data.result_json),
    );
  }

  claimForAttempt(attemptId: string):
    | {
        readonly ownerId: string;
        readonly token: number;
      }
    | undefined {
    const row = ClaimRowSchema.safeParse(
      this.#database
        .prepare(`SELECT jobs.lease_owner, jobs.lease_token FROM jobs
          JOIN attempts USING (job_id) WHERE attempts.attempt_id = ?`)
        .get(attemptId),
    );
    return row.success
      ? { ownerId: row.data.lease_owner, token: row.data.lease_token }
      : undefined;
  }

  logicalArtifactForAttempt(attemptId: string): string | undefined {
    const row = LogicalArtifactRowSchema.safeParse(
      this.#database
        .prepare(
          "SELECT logical_artifact_key FROM attempts WHERE attempt_id = ?",
        )
        .get(attemptId),
    );
    return row.success ? row.data.logical_artifact_key : undefined;
  }

  inputHashForAttempt(attemptId: string): string | undefined {
    const row = this.#database
      .prepare("SELECT input_hash AS inputHash FROM attempts WHERE attempt_id = ?")
      .get(attemptId) as { readonly inputHash: string } | undefined;
    return row?.inputHash;
  }

  sourceArtifactsForJob(jobId: string): readonly {
    readonly artifactId: string;
    readonly contentHash: string;
    readonly mediaType: string;
  }[] {
    return this.#database
      .prepare(`SELECT artifacts.artifact_id, artifacts.content_hash,
        artifacts.media_type FROM job_input_artifacts
        JOIN artifacts USING(artifact_id)
        WHERE job_input_artifacts.job_id = ? ORDER BY artifacts.artifact_id`)
      .all(jobId)
      .map((value) => SourceArtifactRowSchema.parse(value))
      .map((row) => ({
        artifactId: row.artifact_id,
        contentHash: row.content_hash,
        mediaType: row.media_type,
      }));
  }

  readCommittedReservation(key: LaunchReservationKey): Promise<unknown> {
    const row = ReservationRowSchema.safeParse(
      this.#database
        .prepare(`SELECT attempts.run_id, attempts.job_id, attempts.attempt_id,
          COALESCE(research_call_ordinals.ordinal,
            question_call_ordinals.ordinal) AS ordinal,
          attempts.input_hash, jobs.lease_owner, jobs.lease_token,
          jobs.lease_expires_at
        FROM attempts JOIN jobs USING (job_id)
        LEFT JOIN research_call_ordinals USING (attempt_id)
        LEFT JOIN question_call_ordinals USING (attempt_id)
        WHERE attempts.run_id = @runId AND attempts.job_id = @jobId
          AND attempts.attempt_id = @attemptId
          AND COALESCE(research_call_ordinals.ordinal,
            question_call_ordinals.ordinal) = @ordinal`)
        .get(key),
    );
    if (!row.success || row.data.lease_expires_at <= new Date(0).toISOString())
      return Promise.resolve(undefined);
    const fence = {
      ownerId: row.data.lease_owner,
      token: row.data.lease_token,
    };
    return Promise.resolve({
      runId: row.data.run_id,
      jobId: row.data.job_id,
      attemptId: row.data.attempt_id,
      ordinal: row.data.ordinal,
      status: "spawn_reserved",
      committed: true,
      inputHash: row.data.input_hash,
      reservationFence: fence,
      currentFence: fence,
    });
  }

  markReplacementRunning(attemptId: string): void {
    this.#database.transaction(() => {
      this.#database
        .prepare(`UPDATE attempts SET status = 'running'
          WHERE attempt_id = ? AND status = 'spawn-reserved'`)
        .run(attemptId);
      this.#database
        .prepare(`UPDATE jobs SET status = 'running'
          WHERE attempt_id = ? AND status = 'spawn-reserved'`)
        .run(attemptId);
    })();
  }

  rebindReplacementInput(attemptId: string, inputHash: string): boolean {
    if (!/^[0-9a-f]{64}$/u.test(inputHash)) return false;
    try {
      return this.#database.transaction(() => {
        const row = this.#database
          .prepare(`SELECT attempts.job_id AS jobId FROM attempts
            JOIN jobs USING(job_id)
            WHERE attempts.attempt_id = ?
              AND attempts.replacement_of_attempt_id IS NOT NULL
              AND jobs.attempt_id = attempts.attempt_id
              AND NOT EXISTS (SELECT 1 FROM agent_runner_evidence
                WHERE agent_runner_evidence.attempt_id = attempts.attempt_id)`)
          .get(attemptId) as { readonly jobId: string } | undefined;
        if (row === undefined) throw new TypeError("replacement input is not rebindable");
        const job = this.#database
          .prepare(`UPDATE jobs SET input_hash = ?
            WHERE job_id = ? AND attempt_id = ?`)
          .run(inputHash, row.jobId, attemptId).changes;
        const attempt = this.#database
          .prepare(`UPDATE attempts SET input_hash = ? WHERE attempt_id = ?`)
          .run(inputHash, attemptId).changes;
        const ordinal = this.#database
          .prepare(`UPDATE research_call_ordinals SET input_hash = ?
            WHERE attempt_id = ?`)
          .run(inputHash, attemptId).changes;
        if (job !== 1 || attempt !== 1 || ordinal !== 1)
          throw new TypeError("replacement input rebind was incomplete");
        return true;
      }).immediate();
    } catch (error) {
      if (error instanceof Error) return false;
      throw error;
    }
  }

  consumeReplacementBudget(runId: string): void {
    const changed = this.#database
      .prepare(`UPDATE runs SET requested_replacement_calls =
        requested_replacement_calls - 1
        WHERE run_id = ? AND requested_replacement_calls > 0`)
      .run(runId).changes;
    if (changed !== 1)
      throw new TypeError("durable replacement budget is exhausted");
  }

  replay(runId: string): {
    readonly snapshotId: string;
    readonly receipts: readonly SpecialistDurableReceipt[];
    readonly artifacts: readonly string[];
    readonly sequences: readonly number[];
  } {
    const run = z
      .object({ snapshot_id: z.string().uuid() })
      .parse(
        this.#database
          .prepare("SELECT snapshot_id FROM runs WHERE run_id = ?")
          .get(runId),
      );
    const receipts = this.#database
      .prepare(`SELECT research_call_ordinals.ordinal,
        research_call_ordinals.logical_artifact_key,
        research_call_ordinals.attempt_id, attempts.outcome,
        CASE WHEN agent_runner_evidence.attempt_id IS NULL THEN 0 ELSE 1 END
          AS evidence_recorded
      FROM research_call_ordinals JOIN attempts USING (attempt_id)
      LEFT JOIN agent_runner_evidence USING (attempt_id)
      WHERE research_call_ordinals.run_id = ?
        AND research_call_ordinals.logical_artifact_key LIKE 'memo:%'
      ORDER BY ordinal`)
      .all(runId)
      .map((value) => ReceiptRowSchema.parse(value))
      .map((row) => ({
        ordinal: row.ordinal,
        roleId: z
          .enum(WORKFLOW_V1_SPECIALIST_IDS)
          .parse(row.logical_artifact_key.replace(/^memo:/, "")),
        attemptId: row.attempt_id,
        outcome: row.outcome ?? "reserved",
        evidenceRecorded: row.evidence_recorded === 1,
      }));
    const commits = this.#database
      .prepare(`SELECT agent_output_commits.artifact_id, run_events.sequence
        FROM agent_output_commits JOIN attempts USING (attempt_id)
        JOIN run_events ON run_events.event_id = agent_output_commits.event_id
        WHERE attempts.run_id = ? ORDER BY run_events.sequence`)
      .all(runId)
      .map((value) => CommitRowSchema.parse(value));
    return {
      snapshotId: run.snapshot_id,
      receipts,
      artifacts: commits.map((row) => row.artifact_id),
      sequences: commits.map((row) => row.sequence),
    };
  }

  close(): void {
    if (this.#database.open) this.#database.close();
  }
}

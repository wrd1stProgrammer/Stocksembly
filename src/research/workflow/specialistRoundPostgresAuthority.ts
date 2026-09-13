import { z } from "zod";
import { hashCanonical } from "../domain/contractHelpers";
import { AttemptIdSchema, JobIdSchema, RunIdSchema } from "../domain/ids";
import { WORKFLOW_V1_SPECIALIST_IDS } from "../domain/roleRegistry";
import type {
  LaunchReservationKey,
  LaunchReservationReader,
} from "../server/codex/codexRunner";
import type { ResearchDatabase } from "../server/persistence/postgres/database";
import { withResearchTransaction } from "../server/persistence/postgres/database";
import { parseSafeJson } from "../server/persistence/postgres/safeJson";
import type {
  PersistedSpecialistJob,
  SpecialistDurableReceipt,
} from "./specialistRoundPostgresContracts";
import { PersistedSpecialistJobSchema } from "./specialistRoundPostgresContracts";

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
const RepairPromptSchema = z.object({
  prompt: z.string().min(1),
  validationCode: z.string().min(1).optional(),
});

export class SpecialistRoundPostgresAuthority
  implements LaunchReservationReader
{
  readonly #database: ResearchDatabase;

  constructor(database: ResearchDatabase) {
    this.#database = database;
  }

  async sealSnapshot(
    snapshotId: string,
    cutoffAt: string,
    sealedAt: string,
  ): Promise<void> {
    await this.#database.query(
      `UPDATE snapshots SET state = 'sealed',
        evidence_cutoff_at = $1, sealed_at = $2 WHERE snapshot_id = $3`,
      [cutoffAt, sealedAt, snapshotId],
    );
  }

  async persistJobs(
    jobs: readonly PersistedSpecialistJob[],
    at: string,
  ): Promise<void> {
    const insert = `INSERT INTO idempotency_records(
      scope, idempotency_key, request_hash, result_json, created_at
    ) VALUES ('specialist-round-job', $1, $2,
      $3, $4)`;
    await withResearchTransaction(this.#database, async (transaction) => {
      for (const job of jobs)
        await transaction.query(insert, [
          `${job.runId}:${job.logicalArtifactId}`,
          job.inputHash,
          JSON.stringify(job),
          at,
        ]);
    });
  }

  async reserveDepartmentTheses(input: {
    readonly runId: string;
    readonly departmentId: string;
    readonly roleId: string;
    readonly fingerprints: readonly string[];
    readonly at: string;
  }): Promise<boolean> {
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
    const read = `SELECT result_json
      FROM idempotency_records WHERE scope = 'specialist-department-thesis'
        AND idempotency_key = $1`;
    const insert = `INSERT INTO idempotency_records(
      scope, idempotency_key, request_hash, result_json, created_at
    ) VALUES ('specialist-department-thesis', $1, $2,
      $3, $4)`;
    try {
      return await withResearchTransaction(
        this.#database,
        async (transaction) => {
          const pending: typeof reservations = [];
          for (const reservation of reservations) {
            const existing = z
              .object({ result_json: z.string() })
              .safeParse(
                (await transaction.query(read, [reservation.key])).rows[0],
              );
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
            await transaction.query(insert, [
              reservation.key,
              reservation.fingerprintHash,
              JSON.stringify({ roleId: input.roleId }),
              input.at,
            ]);
          return true;
        },
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code === "23505"
      )
        return false;
      throw error;
    }
  }

  async releaseSystemCollectionReservation(
    runId: string,
    attemptId: string,
  ): Promise<void> {
    await withResearchTransaction(this.#database, async (transaction) => {
      const removed = (
        await transaction.query(
          `DELETE FROM research_call_ordinals
          WHERE run_id = $1 AND attempt_id = $2
            AND logical_artifact_key = 'collection:initial'`,
          [runId, attemptId],
        )
      ).rowCount;
      if (removed === 1)
        await transaction.query(
          `UPDATE runs SET remaining_base_calls =
            remaining_base_calls + 1 WHERE run_id = $1`,
          [runId],
        );
    });
  }

  async loadJob(
    runId: string,
    logicalArtifactId: string,
  ): Promise<PersistedSpecialistJob | undefined> {
    const value = (
      await this.#database.query(
        `SELECT result_json FROM idempotency_records
        WHERE scope = 'specialist-round-job' AND idempotency_key = $1`,
        [`${runId}:${logicalArtifactId}`],
      )
    ).rows[0];
    const parsedRow = z.object({ result_json: z.string() }).safeParse(value);
    if (!parsedRow.success) return undefined;
    return PersistedSpecialistJobSchema.parse(
      parseSafeJson(parsedRow.data.result_json),
    );
  }

  async claimForAttempt(attemptId: string): Promise<
    | {
        readonly ownerId: string;
        readonly token: number;
      }
    | undefined
  > {
    const row = ClaimRowSchema.safeParse(
      (
        await this.#database.query(
          `SELECT jobs.lease_owner, jobs.lease_token FROM jobs
          JOIN attempts USING (job_id) WHERE attempts.attempt_id = $1`,
          [attemptId],
        )
      ).rows[0],
    );
    return row.success
      ? { ownerId: row.data.lease_owner, token: row.data.lease_token }
      : undefined;
  }

  async logicalArtifactForAttempt(
    attemptId: string,
  ): Promise<string | undefined> {
    const row = LogicalArtifactRowSchema.safeParse(
      (
        await this.#database.query(
          "SELECT logical_artifact_key FROM attempts WHERE attempt_id = $1",
          [attemptId],
        )
      ).rows[0],
    );
    return row.success ? row.data.logical_artifact_key : undefined;
  }

  async inputHashForAttempt(attemptId: string): Promise<string | undefined> {
    const row = (
      await this.#database.query(
        'SELECT input_hash AS "inputHash" FROM attempts WHERE attempt_id = $1',
        [attemptId],
      )
    ).rows[0] as { readonly inputHash: string } | undefined;
    return row?.inputHash;
  }

  async sourceArtifactsForJob(jobId: string): Promise<
    readonly {
      readonly artifactId: string;
      readonly contentHash: string;
      readonly mediaType: string;
    }[]
  > {
    return (
      await this.#database.query(
        `SELECT artifacts.artifact_id, artifacts.content_hash,
        artifacts.media_type FROM job_input_artifacts
        JOIN artifacts USING(artifact_id)
        WHERE job_input_artifacts.job_id = $1 ORDER BY artifacts.artifact_id`,
        [jobId],
      )
    ).rows
      .map((value) => SourceArtifactRowSchema.parse(value))
      .map((row) => ({
        artifactId: row.artifact_id,
        contentHash: row.content_hash,
        mediaType: row.media_type,
      }));
  }

  async readCommittedReservation(key: LaunchReservationKey): Promise<unknown> {
    const row = ReservationRowSchema.safeParse(
      (
        await this.#database.query(
          `SELECT attempts.run_id, attempts.job_id, attempts.attempt_id,
          COALESCE(research_call_ordinals.ordinal,
            question_call_ordinals.ordinal) AS ordinal,
          attempts.input_hash, jobs.lease_owner, jobs.lease_token,
          jobs.lease_expires_at
        FROM attempts JOIN jobs USING (job_id)
        LEFT JOIN research_call_ordinals
          ON research_call_ordinals.attempt_id = attempts.attempt_id
        LEFT JOIN question_call_ordinals
          ON question_call_ordinals.attempt_id = attempts.attempt_id
        WHERE attempts.run_id = $1 AND attempts.job_id = $2
          AND attempts.attempt_id = $3
          AND COALESCE(research_call_ordinals.ordinal,
            question_call_ordinals.ordinal) = $4`,
          [key.runId, key.jobId, key.attemptId, key.ordinal],
        )
      ).rows[0],
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

  async markReplacementRunning(attemptId: string): Promise<void> {
    await withResearchTransaction(this.#database, async (transaction) => {
      await transaction.query(
        `UPDATE attempts SET status = 'running'
          WHERE attempt_id = $1 AND status = 'spawn-reserved'`,
        [attemptId],
      );
      await transaction.query(
        `UPDATE jobs SET status = 'running'
          WHERE attempt_id = $1 AND status = 'spawn-reserved'`,
        [attemptId],
      );
    });
  }

  async rebindReplacementInput(
    attemptId: string,
    inputHash: string,
  ): Promise<boolean> {
    if (!/^[0-9a-f]{64}$/u.test(inputHash)) return false;
    try {
      return await withResearchTransaction(
        this.#database,
        async (transaction) => {
          const row = (
            await transaction.query(
              `SELECT attempts.job_id AS "jobId" FROM attempts
            JOIN jobs USING(job_id)
            WHERE attempts.attempt_id = $1
              AND attempts.replacement_of_attempt_id IS NOT NULL
              AND jobs.attempt_id = attempts.attempt_id
              AND NOT EXISTS (SELECT 1 FROM agent_runner_evidence
                WHERE agent_runner_evidence.attempt_id = attempts.attempt_id)`,
              [attemptId],
            )
          ).rows[0] as { readonly jobId: string } | undefined;
          if (row === undefined)
            throw new TypeError("replacement input is not rebindable");
          const job = (
            await transaction.query(
              `UPDATE jobs SET input_hash = $1
            WHERE job_id = $2 AND attempt_id = $3`,
              [inputHash, row.jobId, attemptId],
            )
          ).rowCount;
          const attempt = (
            await transaction.query(
              "UPDATE attempts SET input_hash = $1 WHERE attempt_id = $2",
              [inputHash, attemptId],
            )
          ).rowCount;
          const ordinal = (
            await transaction.query(
              `UPDATE research_call_ordinals SET input_hash = $1
            WHERE attempt_id = $2`,
              [inputHash, attemptId],
            )
          ).rowCount;
          if (job !== 1 || attempt !== 1 || ordinal !== 1)
            throw new TypeError("replacement input rebind was incomplete");
          return true;
        },
      );
    } catch (error) {
      if (error instanceof Error) return false;
      throw error;
    }
  }

  async persistValidationFeedback(
    attemptId: string,
    feedback: string,
    at: string,
  ): Promise<void> {
    const value = { feedback };
    const requestHash = hashCanonical(value);
    await this.#database.query(
      `INSERT INTO idempotency_records(
      scope, idempotency_key, request_hash, result_json, created_at
    ) VALUES ('specialist-validation-feedback', $1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [attemptId, requestHash, JSON.stringify(value), at],
    );
    const saved = (
      await this.#database.query(
        `SELECT request_hash FROM idempotency_records
      WHERE scope = 'specialist-validation-feedback' AND idempotency_key = $1`,
        [attemptId],
      )
    ).rows[0];
    if (
      !z.object({ request_hash: z.literal(requestHash) }).safeParse(saved)
        .success
    )
      throw new TypeError("specialist_validation_feedback_changed");
  }

  async previousValidationFeedback(
    attemptId: string,
  ): Promise<string | undefined> {
    const row = (
      await this.#database.query(
        `SELECT f.result_json, f.request_hash
      FROM attempts a JOIN attempts previous ON previous.attempt_id = a.replacement_of_attempt_id
        AND previous.job_id = a.job_id AND previous.run_id = a.run_id
      JOIN idempotency_records f ON f.scope = 'specialist-validation-feedback'
        AND f.idempotency_key = previous.attempt_id
      WHERE a.attempt_id = $1`,
        [attemptId],
      )
    ).rows[0];
    const parsed = z
      .object({ result_json: z.string(), request_hash: z.string() })
      .safeParse(row);
    if (!parsed.success) return undefined;
    const value = z
      .object({ feedback: z.string().max(12000) })
      .parse(parseSafeJson(parsed.data.result_json));
    if (hashCanonical(value) !== parsed.data.request_hash)
      throw new TypeError("specialist_validation_feedback_changed");
    return value.feedback;
  }

  async persistRepairPrompt(input: {
    readonly jobId: string;
    readonly inputHash: string;
    readonly prompt: string;
    readonly validationCode?: string;
    readonly at: string;
  }): Promise<boolean> {
    if (!/^[0-9a-f]{64}$/u.test(input.inputHash) || input.prompt.length === 0)
      return false;
    const key = `${input.jobId}:${input.inputHash}`;
    const value = {
      prompt: input.prompt,
      ...(input.validationCode === undefined
        ? {}
        : { validationCode: input.validationCode }),
    };
    const requestHash = hashCanonical(value);
    try {
      return await withResearchTransaction(
        this.#database,
        async (transaction) => {
          await transaction.query(
            `INSERT INTO idempotency_records(
              scope, idempotency_key, request_hash, result_json, created_at
            ) VALUES ('specialist-repair-prompt', $1, $2, $3, $4)  ON CONFLICT DO NOTHING`,
            [key, requestHash, JSON.stringify(value), input.at],
          );
          const stored = (
            await transaction.query(
              `SELECT request_hash AS "requestHash", result_json AS "resultJson"
              FROM idempotency_records
              WHERE scope = 'specialist-repair-prompt'
                AND idempotency_key = $1`,
              [key],
            )
          ).rows[0] as
            | { readonly requestHash: string; readonly resultJson: string }
            | undefined;
          if (stored?.requestHash !== requestHash) return false;
          const parsed = RepairPromptSchema.safeParse(
            parseSafeJson(stored.resultJson),
          );
          return parsed.success && hashCanonical(parsed.data) === requestHash;
        },
      );
    } catch (error) {
      if (error instanceof Error) return false;
      throw error;
    }
  }

  async repairPromptForInput(
    jobId: string,
    inputHash: string,
  ): Promise<
    { readonly prompt: string; readonly validationCode?: string } | undefined
  > {
    const row = (
      await this.#database.query(
        `SELECT result_json AS "resultJson" FROM idempotency_records
        WHERE scope = 'specialist-repair-prompt'
          AND idempotency_key = $1`,
        [`${jobId}:${inputHash}`],
      )
    ).rows[0] as { readonly resultJson: string } | undefined;
    if (row === undefined) return undefined;
    const parsed = RepairPromptSchema.safeParse(parseSafeJson(row.resultJson));
    if (!parsed.success) return undefined;
    return parsed.data.validationCode === undefined
      ? { prompt: parsed.data.prompt }
      : {
          prompt: parsed.data.prompt,
          validationCode: parsed.data.validationCode,
        };
  }

  async consumeReplacementBudget(runId: string): Promise<void> {
    const changed = (
      await this.#database.query(
        `UPDATE runs SET requested_replacement_calls =
        requested_replacement_calls - 1
        WHERE run_id = $1 AND requested_replacement_calls > 0`,
        [runId],
      )
    ).rowCount;
    if (changed !== 1)
      throw new TypeError("durable replacement budget is exhausted");
  }

  async retryCodeForJob(jobId: string): Promise<string | undefined> {
    const row = (
      await this.#database.query(
        `SELECT result_json FROM idempotency_records
        WHERE scope = 'worker-retry' AND idempotency_key = $1`,
        [jobId],
      )
    ).rows[0] as { readonly result_json: string } | undefined;
    if (row === undefined) return undefined;
    const parsed = z
      .object({ code: z.string().min(1).optional() })
      .safeParse(parseSafeJson(row.result_json));
    return parsed.success ? parsed.data.code : undefined;
  }

  async replay(runId: string): Promise<{
    readonly snapshotId: string;
    readonly receipts: readonly SpecialistDurableReceipt[];
    readonly artifacts: readonly string[];
    readonly sequences: readonly number[];
  }> {
    const run = z
      .object({ snapshot_id: z.string().uuid() })
      .parse(
        (
          await this.#database.query(
            "SELECT snapshot_id FROM runs WHERE run_id = $1",
            [runId],
          )
        ).rows[0],
      );
    const receipts = (
      await this.#database.query(
        `SELECT research_call_ordinals.ordinal,
        research_call_ordinals.logical_artifact_key,
        research_call_ordinals.attempt_id, attempts.outcome,
        CASE WHEN agent_runner_evidence.attempt_id IS NULL THEN 0 ELSE 1 END
          AS evidence_recorded
      FROM research_call_ordinals JOIN attempts USING (attempt_id)
      LEFT JOIN agent_runner_evidence USING (attempt_id)
      WHERE research_call_ordinals.run_id = $1
        AND research_call_ordinals.logical_artifact_key LIKE 'memo:%'
      ORDER BY ordinal`,
        [runId],
      )
    ).rows
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
    const commits = (
      await this.#database.query(
        `SELECT agent_output_commits.artifact_id, run_events.sequence
        FROM agent_output_commits JOIN attempts USING (attempt_id)
        JOIN run_events ON run_events.event_id = agent_output_commits.event_id
        WHERE attempts.run_id = $1 ORDER BY run_events.sequence`,
        [runId],
      )
    ).rows.map((value) => CommitRowSchema.parse(value));
    return {
      snapshotId: run.snapshot_id,
      receipts,
      artifacts: commits.map((row) => row.artifact_id),
      sequences: commits.map((row) => row.sequence),
    };
  }

  close(): void {}
}

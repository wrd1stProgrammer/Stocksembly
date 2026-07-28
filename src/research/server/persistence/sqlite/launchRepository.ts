import type Database from "better-sqlite3";
import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../../../domain/callBudgetContracts";
import {
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { LaunchReservationError } from "./errors";
import { appendRunEvent } from "./runRepository";
import type {
  LaunchReservation,
  ReserveQuestionLaunchInput,
  ReserveResearchLaunchInput,
} from "./types";

const ReservableJobSchema = z.object({
  job_id: JobIdSchema,
  run_id: RunIdSchema,
  snapshot_id: SnapshotIdSchema,
  kind: z.enum(["research", "qa"]),
  input_hash: z.string(),
  input_manifest_hash: z.string().nullable(),
  status: z.string(),
  lease_owner: z.string().nullable(),
  lease_token: z.number().int(),
  lease_expires_at: z.string().nullable(),
});
const QuestionLaunchSchema = ReservableJobSchema.extend({
  question_id: z.string(),
  report_id: z.string(),
  question_status: z.string(),
});
const OrdinalRowSchema = z.object({ ordinal: z.number().int().nonnegative() });

function assertCurrentLease(
  job: z.infer<typeof ReservableJobSchema>,
  input: {
    readonly ownerId: string;
    readonly token: number;
    readonly now: string;
    readonly inputHash: string;
  },
  attemptId: string,
): void {
  if (
    job.status !== "leased" ||
    job.lease_owner !== input.ownerId ||
    job.lease_token !== input.token ||
    job.lease_expires_at === null ||
    job.lease_expires_at <= input.now
  )
    throw new LaunchReservationError(attemptId, "lease fence is stale");
  if (job.input_hash !== input.inputHash)
    throw new LaunchReservationError(
      attemptId,
      "attempt input hash does not match durable job input",
    );
}

export function reserveResearchLaunch(
  database: Database.Database,
  input: ReserveResearchLaunchInput,
): LaunchReservation {
  return database
    .transaction(() => {
      const job = ReservableJobSchema.parse(
        database
          .prepare("SELECT * FROM jobs WHERE job_id = ?")
          .get(input.jobId),
      );
      assertCurrentLease(job, input, input.attemptId);
      if (job.kind !== "research" || job.run_id !== input.runId)
        throw new LaunchReservationError(
          input.attemptId,
          "job lineage or kind does not match",
        );
      const latest = OrdinalRowSchema.parse(
        database
          .prepare(`SELECT COALESCE(MAX(ordinal), 0) AS ordinal
          FROM research_call_ordinals WHERE run_id = ?`)
          .get(input.runId),
      ).ordinal;
      const ordinal = latest + 1;
      if (ordinal > CALL_BUDGET_POLICY.maxPhysicalLaunches)
        throw new LaunchReservationError(
          input.attemptId,
          "physical launch limit exhausted",
        );
      database
        .prepare(`INSERT INTO attempts(
        attempt_id, job_id, run_id, snapshot_id, kind, status,
        logical_artifact_key, input_hash, input_manifest_hash,
        replacement_of_attempt_id, created_at
      ) VALUES (
        @attemptId, @jobId, @runId, @snapshotId, 'research', 'spawn-reserved',
        @logicalArtifactKey, @inputHash, @inputManifestHash,
        @replacementOfAttemptId, @reservedAt
      )`)
        .run({
          ...input,
          snapshotId: job.snapshot_id,
          inputManifestHash: job.input_manifest_hash,
          replacementOfAttemptId: input.replacementOfAttemptId ?? null,
        });
      database
        .prepare(`INSERT INTO research_call_ordinals(
        run_id, ordinal, job_id, attempt_id, logical_artifact_key,
        input_hash, reserved_at
      ) VALUES (
        @runId, @ordinal, @jobId, @attemptId, @logicalArtifactKey,
        @inputHash, @reservedAt
      )`)
        .run({ ...input, ordinal });
      const changed = database
        .prepare(`UPDATE jobs SET status = 'spawn-reserved', attempt_id = @attemptId
        WHERE job_id = @jobId AND status = 'leased'
          AND lease_owner = @ownerId AND lease_token = @token`)
        .run(input).changes;
      if (changed !== 1)
        throw new LaunchReservationError(
          input.attemptId,
          "job changed during reservation",
        );
      appendRunEvent(database, {
        runId: input.runId,
        event: {
          ...input.event,
          jobId: input.jobId,
          attemptId: input.attemptId,
          payload: { ordinal },
        },
      });
      const reservation: LaunchReservation = {
        attemptId: input.attemptId,
        ordinal,
        state: "burned",
      };
      return reservation;
    })
    .immediate();
}

export function reserveQuestionLaunch(
  database: Database.Database,
  input: ReserveQuestionLaunchInput,
): LaunchReservation {
  return database
    .transaction(() => {
      const row = QuestionLaunchSchema.parse(
        database
          .prepare(`SELECT jobs.*, questions.question_id, questions.report_id,
          questions.status AS question_status
          FROM questions JOIN jobs ON jobs.job_id = questions.job_id
          WHERE questions.question_id = ?`)
          .get(input.questionId),
      );
      assertCurrentLease(row, input, input.attemptId);
      if (row.kind !== "qa" || row.question_status !== "pending")
        throw new LaunchReservationError(
          input.attemptId,
          "question is not pending",
        );
      const latest = OrdinalRowSchema.parse(
        database
          .prepare(`SELECT COALESCE(MAX(ordinal), 0) AS ordinal
          FROM question_call_ordinals WHERE report_id = ?`)
          .get(row.report_id),
      ).ordinal;
      const ordinal = latest + 1;
      if (ordinal > 20)
        throw new LaunchReservationError(
          input.attemptId,
          "question launch limit exhausted",
        );
      database
        .prepare(`INSERT INTO attempts(
        attempt_id, job_id, run_id, snapshot_id, kind, status,
        logical_artifact_key, input_hash, created_at
      ) VALUES (
        @attemptId, @jobId, @runId, @snapshotId, 'qa', 'spawn-reserved',
        @logicalArtifactKey, @inputHash, @reservedAt
      )`)
        .run({
          ...input,
          jobId: row.job_id,
          runId: row.run_id,
          snapshotId: row.snapshot_id,
          logicalArtifactKey: `question:${input.questionId}`,
        });
      database
        .prepare(`INSERT INTO question_call_ordinals(
        report_id, ordinal, question_id, job_id, attempt_id, input_hash, reserved_at
      ) VALUES (
        @reportId, @ordinal, @questionId, @jobId, @attemptId, @inputHash, @reservedAt
      )`)
        .run({ ...input, reportId: row.report_id, jobId: row.job_id, ordinal });
      database
        .prepare(
          "UPDATE questions SET status = 'spawn_reserved' WHERE question_id = ?",
        )
        .run(input.questionId);
      database
        .prepare(`UPDATE jobs SET status = 'spawn-reserved', attempt_id = @attemptId
        WHERE job_id = @jobId AND lease_owner = @ownerId AND lease_token = @token`)
        .run({ ...input, jobId: row.job_id });
      const reservation: LaunchReservation = {
        attemptId: input.attemptId,
        ordinal,
        state: "burned",
      };
      return reservation;
    })
    .immediate();
}

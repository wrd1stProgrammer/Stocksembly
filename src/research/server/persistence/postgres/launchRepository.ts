import { z } from "zod";
import { CALL_BUDGET_POLICY } from "../../../domain/callBudgetContracts";
import {
  JobIdSchema,
  RunIdSchema,
  SnapshotIdSchema,
} from "../../../domain/ids";
import { type ResearchDatabase, researchTransaction } from "./database";
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
export async function reserveResearchLaunch(
  database: ResearchDatabase,
  input: ReserveResearchLaunchInput,
): Promise<LaunchReservation> {
  return await researchTransaction(database, async (database) => {
    await database.query(
      "SELECT run_id FROM research.runs WHERE run_id=$1 FOR UPDATE",
      [input.runId],
    );
    const job = ReservableJobSchema.parse(
      (
        await database.query(
          `SELECT * FROM research.jobs WHERE job_id = $1 FOR UPDATE`,
          [input.jobId],
        )
      ).rows[0],
    );
    assertCurrentLease(job, input, input.attemptId);
    if (job.kind !== "research" || job.run_id !== input.runId)
      throw new LaunchReservationError(
        input.attemptId,
        "job lineage or kind does not match",
      );
    const latest = OrdinalRowSchema.parse(
      (
        await database.query(
          `SELECT COALESCE(MAX(ordinal), 0) AS ordinal
          FROM research.research_call_ordinals WHERE run_id = $1`,
          [input.runId],
        )
      ).rows[0],
    ).ordinal;
    const ordinal = latest + 1;
    if (ordinal > CALL_BUDGET_POLICY.maxPhysicalLaunches)
      throw new LaunchReservationError(
        input.attemptId,
        "physical launch limit exhausted",
      );
    await database.query(
      `INSERT INTO research.attempts(
        attempt_id, job_id, run_id, snapshot_id, kind, status,
        logical_artifact_key, input_hash, input_manifest_hash,
        replacement_of_attempt_id, created_at
      ) VALUES (
        $1, $2, $3, $4, 'research', 'spawn-reserved',
        $5, $6, $7,
        $8, $9
      )`,
      [
        input.attemptId,
        input.jobId,
        input.runId,
        job.snapshot_id,
        input.logicalArtifactKey,
        input.inputHash,
        job.input_manifest_hash,
        input.replacementOfAttemptId ?? null,
        input.reservedAt,
      ],
    );
    await database.query(
      `INSERT INTO research.research_call_ordinals(
        run_id, ordinal, job_id, attempt_id, logical_artifact_key,
        input_hash, reserved_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7
      )`,
      [
        input.runId,
        ordinal,
        input.jobId,
        input.attemptId,
        input.logicalArtifactKey,
        input.inputHash,
        input.reservedAt,
      ],
    );
    const changed = (
      await database.query(
        `UPDATE research.jobs SET status = 'spawn-reserved', attempt_id = $1
        WHERE job_id = $2 AND status = 'leased'
          AND lease_owner = $3 AND lease_token = $4`,
        [input.attemptId, input.jobId, input.ownerId, input.token],
      )
    ).rowCount;
    if (changed !== 1)
      throw new LaunchReservationError(
        input.attemptId,
        "job changed during reservation",
      );
    await appendRunEvent(database, {
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
  });
}
export async function reserveQuestionLaunch(
  database: ResearchDatabase,
  input: ReserveQuestionLaunchInput,
): Promise<LaunchReservation> {
  return await researchTransaction(database, async (database) => {
    const row = QuestionLaunchSchema.parse(
      (
        await database.query(
          `SELECT jobs.*, questions.question_id, questions.report_id,
          questions.status AS question_status
          FROM research.questions JOIN research.jobs ON jobs.job_id = questions.job_id
          WHERE questions.question_id = $1 FOR UPDATE OF jobs, questions`,
          [input.questionId],
        )
      ).rows[0],
    );
    assertCurrentLease(row, input, input.attemptId);
    if (row.kind !== "qa" || row.question_status !== "pending")
      throw new LaunchReservationError(
        input.attemptId,
        "question is not pending",
      );
    await database.query(
      "SELECT report_id FROM research.reports WHERE report_id=$1 FOR UPDATE",
      [row.report_id],
    );
    const latest = OrdinalRowSchema.parse(
      (
        await database.query(
          `SELECT COALESCE(MAX(ordinal), 0) AS ordinal
          FROM research.question_call_ordinals WHERE report_id = $1`,
          [row.report_id],
        )
      ).rows[0],
    ).ordinal;
    const ordinal = latest + 1;
    if (ordinal > 20)
      throw new LaunchReservationError(
        input.attemptId,
        "question launch limit exhausted",
      );
    await database.query(
      `INSERT INTO research.attempts(
        attempt_id, job_id, run_id, snapshot_id, kind, status,
        logical_artifact_key, input_hash, created_at
      ) VALUES (
        $1, $2, $3, $4, 'qa', 'spawn-reserved',
        $5, $6, $7
      )`,
      [
        input.attemptId,
        row.job_id,
        row.run_id,
        row.snapshot_id,
        `question:${input.questionId}`,
        input.inputHash,
        input.reservedAt,
      ],
    );
    await database.query(
      `INSERT INTO research.question_call_ordinals(
        report_id, ordinal, question_id, job_id, attempt_id, input_hash, reserved_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )`,
      [
        row.report_id,
        ordinal,
        input.questionId,
        row.job_id,
        input.attemptId,
        input.inputHash,
        input.reservedAt,
      ],
    );
    await database.query(
      `UPDATE research.questions SET status = 'spawn_reserved' WHERE question_id = $1`,
      [input.questionId],
    );
    await database.query(
      `UPDATE research.jobs SET status = 'spawn-reserved', attempt_id = $1
        WHERE job_id = $2 AND lease_owner = $3 AND lease_token = $4`,
      [input.attemptId, row.job_id, input.ownerId, input.token],
    );
    const reservation: LaunchReservation = {
      attemptId: input.attemptId,
      ordinal,
      state: "burned",
    };
    return reservation;
  });
}
